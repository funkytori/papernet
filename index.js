/**
 * index.js — Express server
 *
 * All data access goes through db.js. This file only handles HTTP concerns:
 * routing, request validation, and response formatting.
 */

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('follow-redirects').http;
const axios = require('axios');
const parseString = require('xml2js').parseString;
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.static(path.join(__dirname, 'frontend', 'build')));
app.use('/papers', express.static(path.join(__dirname, 'papers')));
app.use(express.json());

// ── Helpers ───────────────────────────────────────────────────────────────

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/get
 * Returns all author nodes and the derived collaboration edges.
 */
app.get('/api/get', (_, res) => {
    res.json(db.getGraph());
});

/**
 * POST /api/get/papers  { id }
 * Returns one author and their papers.
 */
app.post('/api/get/papers', (req, res) => {
    const data = db.getAuthorWithPapers(req.body.id);
    if (!data) return res.sendStatus(404);
    res.json(data);
});

/**
 * POST /api/add  { name, cats }
 * Add a new author. Duplicate names (case-insensitive) return 200 silently,
 * matching the original behaviour.
 */
app.post('/api/add', (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.sendStatus(400);

    // addAuthor returns null on a duplicate name (UNIQUE COLLATE NOCASE) —
    // that's not an error, just a no-op.
    db.addAuthor(name, req.body.cats || '');
    res.sendStatus(200);
});

/**
 * POST /api/fetch  { id }
 * Paginate through arXiv and upsert all papers for an author.
 */
app.post('/api/fetch', async (req, res) => {
    const authorId = req.body.id;
    const author = db.getAuthor(authorId);
    if (!author) return res.sendStatus(404);

    const cats = author.cats || '';

    // arXiv expects  (cat:math.NT+OR+cat:math.CO)
    // A bare "math.NT, math.CO" string does not filter correctly.
    const catParts = cats.split(',').map(c => c.trim()).filter(Boolean);
    const catQuery = catParts.length
        ? catParts.map(c => `cat:${c}`).join('+OR+')
        : '';

    const searchBase = catQuery
        ? `au:"${author.name}"+AND+(${catQuery})`
        : `au:"${author.name}"`;

    let toAdd = true;
    let start = 0;
    let hadError = false;

    while (toAdd && !hadError) {
        toAdd = false;
        try {
            const response = await axios(
                `http://export.arxiv.org/api/query?search_query=${searchBase}` +
                `&sortBy=lastUpdatedDate&sortOrder=descending` +
                `&start=${start}&max_results=10`
            );

            await new Promise((resolve, reject) => {
                parseString(response.data, (err, result) => {
                    if (err) { reject(err); return; }

                    const feed = result.feed;
                    if (!('entry' in feed)) { resolve(); return; }

                    feed.entry.forEach(entry => {
                        toAdd = true;

                        // Strip version suffix from the arXiv ID:
                        // "http://arxiv.org/abs/2301.00001v2" → "2301.00001"
                        let id = entry.id[0];
                        id = id.slice(id.lastIndexOf('/') + 1);
                        id = id.slice(0, id.lastIndexOf('v'));

                        const title = entry.title[0].replace(/\s+/g, ' ').trim();
                        let url = null;
                        entry.link.forEach(l => {
                            if (l['$'].title === 'pdf') url = l['$'].href;
                        });

                        db.upsertPaper(authorId, id, title, url);
                    });

                    resolve();
                });
            });
        } catch (err) {
            console.error('arXiv fetch error for author %s:', author.name, err.message);
            hadError = true;
        }

        start += 10;
        if (toAdd && !hadError) await delay(3000);
    }

    if (hadError) return res.sendStatus(500);
    res.sendStatus(200);
});

/**
 * POST /api/del  { id }
 * Delete an author. ON DELETE CASCADE in the DB handles papers and collabs.
 */
app.post('/api/del', (req, res) => {
    const deleted = db.deleteAuthor(req.body.id);
    if (!deleted) return res.sendStatus(404);
    res.sendStatus(200);
});

/**
 * POST /api/download  { id }
 * Download a paper PDF from arXiv and save it to ./papers/<id>.pdf.
 * The `offline` status is derived from filesystem presence, so no DB write
 * is needed after the download completes.
 */
app.post('/api/download', (req, res) => {
    const paper = db.getPaper(req.body.id);
    if (!paper) return res.sendStatus(404);
    if (!paper.URL) return res.sendStatus(422);  // no URL to download from

    const dest = db.getPaperPath(paper.id);

    // TODO: replace the spoofed User-Agent with something honest once arXiv
    // confirms their policy on programmatic PDF downloads.
    const options = { headers: { 'User-Agent': 'Python-urllib/3.6' } };

    http.get(paper.URL, options, stream => {
        const file = fs.createWriteStream(dest);
        stream.pipe(file);

        file.on('finish', () => {
            file.close();
            console.log('Download complete:', paper.id);
            // No DB update needed — decoratePaper() in db.js derives
            // offline status from fs.existsSync() at read time.
            res.sendStatus(200);
        });

        file.on('error', err => {
            fs.unlink(dest, () => { });  // clean up partial file
            console.error('Write error for paper %s:', paper.id, err.message);
            res.sendStatus(500);
        });
    }).on('error', err => {
        console.error('HTTP error downloading paper %s:', paper.id, err.message);
        res.sendStatus(502);
    });
});

// ── SPA fallback ──────────────────────────────────────────────────────────

app.get('*', (_, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, () =>
    console.log('PaperNet running on http://localhost:%s', PORT)
);