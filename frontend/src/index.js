import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { ForceGraph } from './components/forceGraph';

// ---------------------------------------------------------------------------
// Secretary — all network calls, centralised
// ---------------------------------------------------------------------------

class Secretary {
    static headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };

    static handleResponse(res) {
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        return res;
    }

    static fetchAll() {
        return fetch('/api/get', { method: 'GET', headers: this.headers })
            .then(this.handleResponse)
            .then(r => r.json());
    }

    static getPapers(id) {
        return fetch('/api/get/papers', {
            method: 'POST', headers: this.headers,
            body: JSON.stringify({ id }),
        }).then(this.handleResponse).then(r => r.json());
    }

    static addAuthor(name, cats) {
        return fetch('/api/add', {
            method: 'POST', headers: this.headers,
            body: JSON.stringify({ name, cats }),
        }).then(this.handleResponse);
    }

    static refreshPapers(id) {
        return fetch('/api/fetch', {
            method: 'POST', headers: this.headers,
            body: JSON.stringify({ id }),
        }).then(this.handleResponse);
    }

    static dlPaper(id) {
        return fetch('/api/download', {
            method: 'POST', headers: this.headers,
            body: JSON.stringify({ id }),
        }).then(this.handleResponse);
    }

    static delAuthor(id) {
        return fetch('/api/del', {
            method: 'POST', headers: this.headers,
            body: JSON.stringify({ id }),
        }).then(this.handleResponse);
    }
}

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

function Btn({ children, onClick, href, target, rel, disabled, variant = 'primary', size = 'sm' }) {
    const cls = `pn-btn pn-btn--${variant} pn-btn--${size}${disabled ? ' pn-btn--disabled' : ''}`;
    if (href) {
        return <a className={cls} href={href} target={target} rel={rel}>{children}</a>;
    }
    return (
        <button className={cls} onClick={onClick} disabled={disabled}>
            {children}
        </button>
    );
}

function Spinner() {
    return <span className="pn-spinner" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Paper entry
// ---------------------------------------------------------------------------

function PaperEntry({ handleClick, handleDL, paper, clickedId, downloading }) {
    const isSelected = clickedId === paper.id;
    return (
        <li
            className={`pn-paper${isSelected ? ' pn-paper--selected' : ''}`}
            onClick={() => handleClick(paper.aIDs, paper.id)}
            title="Click to highlight co-authors in the graph"
        >
            <p className="pn-paper__title">{paper.name}</p>
            <div className="pn-paper__actions">
                <Btn
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); handleDL(paper.id); }}
                    disabled={downloading === paper.id}
                >
                    {downloading === paper.id ? <><Spinner /> Saving…</> : 'Save PDF'}
                </Btn>
                <Btn variant="ghost" href={paper.URL} target="_blank" rel="noopener">
                    Open online
                </Btn>
                {paper.offline
                    ? <Btn variant="ghost" href={paper.path} target="_blank" rel="noopener">Open saved</Btn>
                    : <Btn variant="ghost" disabled>Not saved</Btn>
                }
            </div>
        </li>
    );
}

// ---------------------------------------------------------------------------
// Paper panel (right column)
// ---------------------------------------------------------------------------

function PaperBar({ data, handleRefreshPapers, handleDLPaper, handleClick,
    handleRemoveAuthor, clickedId, refreshingId, downloadingId }) {
    if (data === null) {
        return (
            <div className="pn-empty">
                <p className="pn-empty__text">Select an author to see their papers.</p>
            </div>
        );
    }

    return (
        <div className="pn-paperbar">
            <div className="pn-paperbar__header">
                <h2 className="pn-paperbar__author">{data.author.name}</h2>
                <div className="pn-paperbar__actions">
                    <Btn
                        onClick={() => handleRefreshPapers(data.author.id)}
                        disabled={refreshingId === data.author.id}
                    >
                        {refreshingId === data.author.id ? <><Spinner /> Refreshing…</> : 'Refresh'}
                    </Btn>
                    <Btn variant="danger" onClick={() => handleRemoveAuthor(data.author.id)}>
                        Remove
                    </Btn>
                </div>
            </div>
            {data.papers.length === 0
                ? <p className="pn-empty__text pn-empty__text--padded">
                    No papers yet — click Refresh to fetch from arXiv.
                </p>
                : (
                    <ul className="pn-paper-list">
                        {data.papers.map(paper => (
                            <PaperEntry
                                key={paper.id}
                                paper={paper}
                                handleDL={handleDLPaper}
                                handleClick={handleClick}
                                clickedId={clickedId}
                                downloading={downloadingId}
                            />
                        ))}
                    </ul>
                )
            }
        </div>
    );
}

// ---------------------------------------------------------------------------
// Author list (flat-list alternative to the graph)
// ---------------------------------------------------------------------------

function AuthorList({ handleClick, nodes, selectedNode, highlightedNodes }) {
    if (nodes.length === 0) {
        return (
            <div className="pn-empty">
                <p className="pn-empty__text">No authors yet. Add one to get started.</p>
            </div>
        );
    }
    return (
        <ul className="pn-author-list">
            {nodes.map(author => {
                const isSelected = selectedNode === author.id;
                const isCollaborator = highlightedNodes.includes(author.id);
                return (
                    <li
                        key={author.id}
                        className={`pn-author-list__item
                            ${isSelected ? ' pn-author-list__item--selected' : ''}
                            ${isCollaborator ? ' pn-author-list__item--collab' : ''}`}
                        onClick={() => handleClick(author.id)}
                    >
                        <span className="pn-author-list__name">{author.name}</span>
                        {isSelected && (
                            <span className="pn-badge pn-badge--selected" title="Selected">selected</span>
                        )}
                        {isCollaborator && (
                            <span className="pn-badge pn-badge--collab" title="Collaborator">collaborator</span>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

// ---------------------------------------------------------------------------
// Add author modal
// ---------------------------------------------------------------------------

function AddAuthorModal({ onAdd }) {
    const [open, setOpen] = React.useState(false);
    const [name, setName] = React.useState('');
    const [cats, setCats] = React.useState('');

    const nameValid = name.trim().length > 0;

    function submit(e) {
        e.preventDefault();
        if (!nameValid) return;
        onAdd(name.trim(), cats.trim());
        setName('');
        setCats('');
        setOpen(false);
    }

    return (
        <>
            <Btn onClick={() => setOpen(true)}>Add author</Btn>

            {open && (
                <div className="pn-modal-backdrop" onClick={() => setOpen(false)}>
                    <div className="pn-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-title">
                        <div className="pn-modal__header">
                            <h3 id="modal-title" className="pn-modal__title">Add an author</h3>
                            <button className="pn-modal__close" onClick={() => setOpen(false)} aria-label="Close">×</button>
                        </div>
                        <form onSubmit={submit}>
                            <div className="pn-modal__body">
                                <div className="pn-field">
                                    <label className="pn-field__label" htmlFor="add-name">Author name</label>
                                    <input
                                        id="add-name"
                                        className="pn-field__input"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="Terence Tao"
                                        autoFocus
                                    />
                                </div>
                                <div className="pn-field">
                                    <label className="pn-field__label" htmlFor="add-cats">
                                        arXiv subjects <span className="pn-field__hint">(optional)</span>
                                    </label>
                                    <input
                                        id="add-cats"
                                        className="pn-field__input"
                                        value={cats}
                                        onChange={e => setCats(e.target.value)}
                                        placeholder="math.NT, math.CO"
                                    />
                                    <p className="pn-field__help">
                                        arXiv category codes, e.g. cs.LG, stat.ML.{' '}
                                        <a href="https://arxiv.org/category_taxonomy" target="_blank" rel="noopener">Browse categories →</a>
                                    </p>
                                </div>
                            </div>
                            <div className="pn-modal__footer">
                                <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
                                <Btn type="submit" disabled={!nameValid}>Add author</Btn>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------

class Main extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            nodes: [],
            links: [],
            selectedNode: null,
            selectedData: null,
            highlightedNodes: [],
            highlightedPaper: null,
            showGraph: true,
            errorMessage: null,
            refreshingAll: false,
            refreshAllProgress: null,
            refreshingId: null,
            downloadingId: null,
        };
        this.handleNodeClick = this.handleNodeClick.bind(this);
        this.handlePaperClick = this.handlePaperClick.bind(this);
        this.handleAddAuthor = this.handleAddAuthor.bind(this);
        this.handleRefreshPapers = this.handleRefreshPapers.bind(this);
        this.handleRefreshAll = this.handleRefreshAll.bind(this);
        this.handleRemoveAuthor = this.handleRemoveAuthor.bind(this);
        this.handleDLPaper = this.handleDLPaper.bind(this);
    }

    componentDidMount() {
        this.refreshGraph();
    }

    render() {
        const { refreshingAll, refreshAllProgress, showGraph } = this.state;

        return (
            <div className="pn-app">
                {/* ── Header ───────────────────────────────────────────── */}
                <header className="pn-header">
                    <span className="pn-header__logo">PaperNet</span>
                    <nav className="pn-toolbar">
                        <Btn
                            variant="ghost"
                            onClick={() => this.setState(s => ({ showGraph: !s.showGraph }))}
                        >
                            {showGraph ? 'List view' : 'Graph view'}
                        </Btn>
                        <AddAuthorModal onAdd={this.handleAddAuthor} />
                        <Btn
                            disabled={refreshingAll}
                            onClick={this.handleRefreshAll}
                        >
                            {refreshingAll
                                ? <><Spinner /> {refreshAllProgress.current}/{refreshAllProgress.total}</>
                                : 'Refresh all'
                            }
                        </Btn>
                    </nav>
                </header>

                {/* ── Error banner (inside layout so header doesn't shift) */}
                {this.state.errorMessage && (
                    <div className="pn-error-banner" role="alert">
                        <span>{this.state.errorMessage}</span>
                        <button
                            className="pn-error-banner__close"
                            onClick={() => this.setState({ errorMessage: null })}
                            aria-label="Dismiss"
                        >×</button>
                    </div>
                )}

                {/* ── Two-panel body ───────────────────────────────────── */}
                <div className="pn-body">
                    <section className="pn-panel pn-panel--graph" aria-label="Author graph">
                        {showGraph ? (
                            nodes => nodes.length === 0
                                ? (
                                    <div className="pn-empty pn-empty--graph">
                                        <p className="pn-empty__text">No authors yet.</p>
                                        <p className="pn-empty__sub">Use "Add author" above to get started.</p>
                                    </div>
                                )
                                : (
                                    <ForceGraph
                                        handleClick={this.handleNodeClick}
                                        nodes={this.state.nodes}
                                        links={this.state.links}
                                        selectedNode={this.state.selectedNode}
                                        highlightedNodes={this.state.highlightedNodes}
                                    />
                                )
                        )(this.state.nodes) : (
                            <AuthorList
                                handleClick={this.handleNodeClick}
                                nodes={this.state.nodes}
                                selectedNode={this.state.selectedNode}
                                highlightedNodes={this.state.highlightedNodes}
                            />
                        )}
                    </section>

                    <section className="pn-panel pn-panel--papers" aria-label="Papers">
                        <PaperBar
                            data={this.state.selectedData}
                            handleRefreshPapers={this.handleRefreshPapers}
                            handleDLPaper={this.handleDLPaper}
                            handleClick={this.handlePaperClick}
                            clickedId={this.state.highlightedPaper}
                            handleRemoveAuthor={this.handleRemoveAuthor}
                            refreshingId={this.state.refreshingId}
                            downloadingId={this.state.downloadingId}
                        />
                    </section>
                </div>
            </div>
        );
    }

    // ── Data helpers ──────────────────────────────────────────────────────

    fetchData(id) {
        if (id === null) {
            this.setState({ selectedData: null });
            return Promise.resolve();
        }
        return Secretary.getPapers(id)
            .then(res => this.setState({ selectedData: res }))
            .catch(err => {
                console.error('Failed to load papers:', err);
                this.setState({ errorMessage: "Couldn't load papers for this author." });
            });
    }

    refreshGraph() {
        let promise = Promise.resolve();
        if (this.state.selectedNode != null) {
            promise = promise.then(() =>
                Secretary.getPapers(this.state.selectedNode)
                    .then(res => this.setState({ selectedData: res }))
            );
        }
        return promise
            .then(() => Secretary.fetchAll())
            .then(res => this.setState({ nodes: res.nodes, links: res.links }))
            .catch(err => {
                console.error('Failed to refresh graph data:', err);
                this.setState({ errorMessage: "Couldn't refresh data from the server." });
            });
    }

    // ── Event handlers ────────────────────────────────────────────────────

    handleAddAuthor(name, cats) {
        return Secretary.addAuthor(name, cats)
            .then(() => this.refreshGraph())
            .catch(err => {
                console.error('Failed to add author:', err);
                this.setState({ errorMessage: "Couldn't add that author. Please try again." });
            });
    }

    handleNodeClick(id) {
        this.setState({ selectedNode: id });
        if (!this.state.highlightedNodes.includes(id)) {
            this.setState({ highlightedNodes: [] });
        }
        this.fetchData(id);
    }

    handlePaperClick(aIDs, paperId) {
        this.setState({ highlightedNodes: aIDs, highlightedPaper: paperId });
    }

    handleRefreshPapers(id) {
        this.setState({ refreshingId: id });
        return Secretary.refreshPapers(id)
            .then(() => this.refreshGraph())
            .catch(err => {
                console.error('Failed to refresh papers for author %s:', id, err);
                this.setState({ errorMessage: "Couldn't refresh papers for one of the authors." });
            })
            .finally(() => this.setState({ refreshingId: null }));
    }

    handleRefreshAll() {
        if (this.state.refreshingAll) return;
        const nodes = this.state.nodes;
        this.setState({ refreshingAll: true, refreshAllProgress: { current: 0, total: nodes.length } });

        nodes.reduce((acc, current, idx) =>
            acc.then(async () => {
                await new Promise(r => setTimeout(r, 3000));
                await this.handleRefreshPapers(current.id);
                this.setState({ refreshAllProgress: { current: idx + 1, total: nodes.length } });
            }),
            Promise.resolve()
        )
            .then(() => console.log('Done refreshing all.'))
            .finally(() => this.setState({ refreshingAll: false, refreshAllProgress: null }));
    }

    handleRemoveAuthor(id) {
        this.setState({ selectedNode: null, selectedData: null });
        return Secretary.delAuthor(id)
            .then(() => this.refreshGraph())
            .catch(err => {
                console.error('Failed to remove author:', err);
                this.setState({ errorMessage: "Couldn't remove that author." });
            });
    }

    handleDLPaper(id) {
        this.setState({ downloadingId: id });
        return Secretary.dlPaper(id)
            .then(() => this.fetchData(this.state.selectedNode))
            .catch(err => {
                console.error('Failed to download paper:', err);
                this.setState({ errorMessage: "Couldn't download that paper." });
            })
            .finally(() => this.setState({ downloadingId: null }));
    }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Main />);