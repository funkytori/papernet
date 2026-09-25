/**
 * db.js — single source of truth for all database access.
 *
 * All queries are prepared once at startup (better-sqlite3 prepared statements
 * are reusable and the preparation cost is paid only once). Every public
 * function is synchronous; better-sqlite3 is a synchronous driver by design,
 * which matches Express's async route handlers cleanly — wrap the call in a
 * try/catch in the route and let the error propagate normally.
 *
 * Schema lives here rather than in a separate migration file so that new
 * installs (no data.json, no existing DB) just work: the tables are created
 * on first run.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const DB = require('better-sqlite3');

const PAPERS_DIR = path.join(__dirname, 'papers');
const DB_FILE = path.join(__dirname, 'papernet.db');

// Ensure the papers directory exists before anything tries to write into it.
fs.mkdirSync(PAPERS_DIR, { recursive: true });

const db = new DB(DB_FILE);
db.pragma('journal_mode = WAL');   // crash-safe atomic writes
db.pragma('foreign_keys = ON');    // enforce ON DELETE CASCADE

// ── Schema ────────────────────────────────────────────────────────────────

db.exec(`
    CREATE TABLE IF NOT EXISTS authors (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        name  TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        cats  TEXT    NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS papers (
        id    TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url   TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS paper_authors (
        paper_id  TEXT    NOT NULL REFERENCES papers(id)  ON DELETE CASCADE,
        author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
        PRIMARY KEY (paper_id, author_id)
    );

    -- Remove a paper automatically once its last author is deleted.
    CREATE TRIGGER IF NOT EXISTS cleanup_orphan_papers
    AFTER DELETE ON paper_authors
    BEGIN
        DELETE FROM papers
        WHERE id = OLD.paper_id
          AND NOT EXISTS (
              SELECT 1 FROM paper_authors WHERE paper_id = OLD.paper_id
          );
    END;
`);

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Return the absolute filesystem path for a paper's local PDF, whether or
 * not the file exists yet. Deriving it from the arXiv ID means we never
 * need to store a path string in the database.
 */
function paperPath(arxivId) {
    return path.join(PAPERS_DIR, `${arxivId}.pdf`);
}

/**
 * Decorate a raw paper row from the DB with runtime-derived fields:
 *   - offline  : true if the PDF is present on disk right now
 *   - path     : the URL path the frontend uses to open a local PDF
 *
 * This replaces the stored `offline` boolean and `path` string from the old
 * JSON schema. The filesystem is the source of truth; the DB doesn't drift
 * out of sync with it.
 */
function decoratePaper(paper) {
    const localPath = paperPath(paper.id);
    return {
        ...paper,
        offline: fs.existsSync(localPath),
        path: `/papers/${paper.id}.pdf`,
    };
}

// ── Prepared statements ───────────────────────────────────────────────────

const stmts = {
    // authors
    allAuthors: db.prepare('SELECT id, name, cats FROM authors ORDER BY name'),
    authorById: db.prepare('SELECT id, name, cats FROM authors WHERE id = ?'),
    insertAuthor: db.prepare('INSERT INTO authors (name, cats) VALUES (?, ?) RETURNING id, name, cats'),
    deleteAuthor: db.prepare('DELETE FROM authors WHERE id = ?'),

    // papers
    papersByAuthor: db.prepare(`
        SELECT p.id, p.title, p.url
        FROM   papers p
        JOIN   paper_authors pa ON pa.paper_id = p.id
        WHERE  pa.author_id = ?
        ORDER  BY p.title
    `),
    paperById: db.prepare('SELECT id, title, url FROM papers WHERE id = ?'),
    upsertPaper: db.prepare(`
        INSERT INTO papers (id, title, url) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET url = excluded.url
    `),
    linkPaperAuthor: db.prepare(`
        INSERT OR IGNORE INTO paper_authors (paper_id, author_id) VALUES (?, ?)
    `),

    // collaboration graph — derived from paper_authors, never stored
    collabs: db.prepare(`
        SELECT DISTINCT pa1.author_id AS source,
                        pa2.author_id AS target
        FROM   paper_authors pa1
        JOIN   paper_authors pa2
               ON  pa1.paper_id  = pa2.paper_id
               AND pa1.author_id < pa2.author_id
    `),
};

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Return all authors as nodes plus the derived collaboration edges.
 * Shape matches the old /api/get response so the frontend needs no changes.
 */
function getGraph() {
    return {
        nodes: stmts.allAuthors.all().map(a => ({ id: a.id, name: a.name })),
        links: stmts.collabs.all(),
    };
}

/**
 * Return one author and their papers (decorated with offline/path).
 * Returns null when the author doesn't exist.
 */
function getAuthorWithPapers(authorId) {
    const author = stmts.authorById.get(authorId);
    if (!author) return null;

    const papers = stmts.papersByAuthor
        .all(authorId)
        .map(p => ({
            id: p.id,
            name: p.title,  // keep "name" key so the frontend doesn't change
            URL: p.url,
            aIDs: paperAuthorIds(p.id),
        }))
        .map(decoratePaper);

    return { author: { id: author.id, name: author.name }, papers };
}

/**
 * All author IDs on a given paper (used to populate aIDs for the frontend).
 */
function paperAuthorIds(paperId) {
    return db.prepare(
        'SELECT author_id FROM paper_authors WHERE paper_id = ?'
    ).all(paperId).map(r => r.author_id);
}

/**
 * Add an author. Returns the new author row, or null if the name already
 * exists (UNIQUE COLLATE NOCASE handles the dedup at the DB level).
 */
function addAuthor(name, cats) {
    try {
        return stmts.insertAuthor.get(name.trim(), (cats || '').trim());
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return null;
        throw err;
    }
}

/**
 * Delete an author by ID. ON DELETE CASCADE in paper_authors removes their
 * authorship links; the orphan-papers trigger removes any papers that have
 * no remaining authors. Returns false when the author didn't exist.
 */
function deleteAuthor(authorId) {
    const { changes } = stmts.deleteAuthor.run(authorId);
    return changes > 0;
}

/**
 * Upsert a paper and link it to an author, all in one transaction.
 * Equivalent to the old tryAddPaper + tryAddLink pair, but:
 *   - "upsert" means re-running a fetch updates the URL without duplicating
 *   - collaboration edges are derived from paper_authors on read, so there
 *     is no tryAddLink equivalent to maintain or de-duplicate here.
 */
const upsertPaperAndLink = db.transaction((authorId, paperId, title, url) => {
    stmts.upsertPaper.run(paperId, title, url || '');
    stmts.linkPaperAuthor.run(paperId, authorId);
});

function upsertPaper(authorId, paperId, title, url) {
    upsertPaperAndLink(authorId, paperId, title, url);
}

/**
 * Look up a single paper (for the download route).
 * Returns null when not found.
 */
function getPaper(paperId) {
    const row = stmts.paperById.get(paperId);
    if (!row) return null;
    return decoratePaper({ id: row.id, name: row.title, URL: row.url });
}

/**
 * The filesystem path where a paper's PDF should be saved.
 * Exported so the download route can pipe directly to it.
 */
function getPaperPath(paperId) {
    return paperPath(paperId);
}

/**
 * Return a single author row (id, name, cats), or null if not found.
 * Used by the fetch route to build the arXiv category query.
 */
function getAuthor(authorId) {
    return stmts.authorById.get(authorId) || null;
}

module.exports = { getGraph, getAuthor, getAuthorWithPapers, addAuthor, deleteAuthor, upsertPaper, getPaper, getPaperPath };