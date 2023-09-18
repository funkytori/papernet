import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import 'bootstrap/dist/css/bootstrap.min.css';

import ListGroup from 'react-bootstrap/ListGroup';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';

import { ForceGraph } from './components/forceGraph';

class Secretary {

    static headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };

    static fetchAll() {
        return fetch('/api/get', {
            method: 'GET',
            headers: this.headers,
        })
            .then((res) => res.json());
    }

    static getPapers(id) {
        return fetch('/api/get/papers', {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ id: id })
        })
            .then((res) => res.json());
    }

    static addAuthor(name, cats) {
        return fetch('/api/add', {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({
                name: name,
                cats: cats,
            })
        });
    }

    static refreshPapers(id) {
        return fetch('/api/fetch', {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ id: id })
        });
    }

    static dlPaper(id) {
        return fetch('/api/download', {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ id: id })
        });
    }

    static delAuthor(id) {
        return fetch('/api/del', {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ id: id })
        });
    }
}

function PaperEntry({ handleClick, handleDL, paper, clickedId }) {
    return <ListGroup.Item
        onClick={() => handleClick(paper.aIDs, paper.id)}
        key={paper.id}>
        <div>
            {clickedId === paper.id ? "🟥" : ""}
            {paper.name}
        </div>
        <Button onClick={() => handleDL(paper.id)}>
            Download
        </Button>
        <Button href={paper.URL} target="_blank" rel="noopener">Open online</Button>
        {paper.offline ?
            <Button href={paper.path} target="_blank" rel="noopener">Open offline</Button> :
            <Button disabled={true}>Open locally</Button>}
    </ListGroup.Item>;
}

function PaperBar({ data, handleRefreshPapers, handleDLPaper, handleClick, handleRemoveAuthor, clickedId }) {
    if (data === null) {
        return <div></div>;
    }

    function renderPaperEntry(paper) {
        return (<PaperEntry paper={paper} handleDL={handleDLPaper} handleClick={handleClick} clickedId={clickedId} />);
    }

    return <div>
        <div className='DirHeader'>
            <h3>{data.author.name}</h3>
            <Button onClick={() => handleRefreshPapers(data.author.id)}>Refresh</Button>{' '}
            <Button onClick={() => handleRemoveAuthor(data.author.id)}>Remove</Button>
        </div>
        <ListGroup>
            {data.papers.map(renderPaperEntry, this)}
        </ListGroup>
    </div >;
}

function AuthorList({ handleClick, nodes, selectedNode, highlightedNodes }) {
    function renderAuthorEntry(author, handleClick, selectedNode, highlightedNodes) {
        return <ListGroup.Item
            key={author.id}
            onClick={() => handleClick(author.id)}>
            {(selectedNode === author.id ? "🟨" : "")}
            {(highlightedNodes.includes(author.id) ? "🟥" : "")}
            {author.name}
        </ListGroup.Item>
    }

    return <ListGroup>
        {nodes.map((x) => renderAuthorEntry(x, handleClick, selectedNode, highlightedNodes), this)}
    </ListGroup>;
}

function AddAuthorForm({ call }) {
    const [name, setName] = React.useState("");
    const [cats, setCats] = React.useState("");
    const [show, setShow] = React.useState(false);

    return <>
        <Button variant="primary" onClick={() => setShow(true)}>
            Add author
        </Button>

        <Modal show={show} onHide={() => setShow(false)}>
            <Modal.Header closeButton>
                <Modal.Title>Add an author</Modal.Title>
            </Modal.Header>
            <form onSubmit={(e) => {
                e.preventDefault();
                call(name, cats);
                setName("");
                setCats("");
                setShow(false);
            }}>
                <Modal.Body>
                    <h> Author: </h>
                    <input
                        name='name'
                        onChange={(e) => setName(e.target.value)}
                        value={name}
                        placeholder="Terence Tao"
                    />
                    <br />
                    <h> Subjects: </h>
                    <input
                        name='cats'
                        onChange={(e) => setCats(e.target.value)}
                        value={cats}
                        placeholder="math.NT, math.CO"
                    />
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="primary" type="submit">
                        Add
                    </Button>
                </Modal.Footer>
            </form>
        </Modal>
    </>;
}

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
        };
        this.handleNodeClick = this.handleNodeClick.bind(this);
        this.handlePaperClick = this.handlePaperClick.bind(this);
        this.handleAddAuthor = this.handleAddAuthor.bind(this);
        this.handleRefreshPapers = this.handleRefreshPapers.bind(this);
        this.handleRemoveAuthor = this.handleRemoveAuthor.bind(this);
        this.handleDLPaper = this.handleDLPaper.bind(this);
    }

    componentDidMount() {
        this.refreshGraph();
    }

    render() {
        return (
            <div className="App">
                <header className="App-header">
                    PaperNet
                </header>
                <div>
                    <section className="split Main">
                        {this.state.showGraph ? (
                            <ForceGraph
                                handleClick={this.handleNodeClick}
                                nodes={this.state.nodes}
                                links={this.state.links}
                                selectedNode={this.state.selectedNode}
                                highlightedNodes={this.state.highlightedNodes} />
                        ) : (
                            <AuthorList handleClick={this.handleNodeClick}
                                nodes={this.state.nodes}
                                selectedNode={this.state.selectedNode}
                                highlightedNodes={this.state.highlightedNodes} />
                        )}
                        <Button variant="primary" onClick={() =>
                            this.setState(prevState => ({
                                showGraph: !prevState.showGraph
                            }))
                        } >
                            Toggle graph view
                        </Button>
                        <AddAuthorForm call={this.handleAddAuthor} />
                        <Button variant="primary" onClick={() => {
                            this.state.nodes.reduce((acc, current, idx) => {
                                return acc.then(async () => {
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                    console.log("Fetching %s, %d", current.name, idx);
                                    return this.handleRefreshPapers(current.id);
                                })
                            }, Promise.resolve())
                                .then(() => { console.log("Done refreshing all.") });
                        }}>
                            Refresh all
                        </Button>
                    </section>
                    <section className="split">
                        <PaperBar
                            data={this.state.selectedData}
                            handleRefreshPapers={this.handleRefreshPapers}
                            handleDLPaper={this.handleDLPaper}
                            handleClick={this.handlePaperClick}
                            clickedId={this.state.highlightedPaper}
                            handleRemoveAuthor={this.handleRemoveAuthor}
                        />
                    </section>
                </div>
            </div >
        );
    }

    fetchData(id) {
        if (id === null) {
            this.setState({
                selectedData: null
            });
        } else {
            return Secretary.getPapers(id)
                .then((res) =>
                    this.setState({
                        selectedData: res
                    }));
        }
    }

    handleAddAuthor(name, cats) {
        return Secretary.addAuthor(name, cats).then(() => this.refreshGraph());
    }

    handleNodeClick(id) {
        this.setState({
            selectedNode: id,
        });
        if (!this.state.highlightedNodes.includes(id)) {
            this.setState({
                highlightedNodes: []
            });
        }
        this.fetchData(id);
    }

    handlePaperClick(aIDs, paperId) {
        this.setState({
            highlightedNodes: aIDs,
            highlightedPaper: paperId
        });
    }

    handleRefreshPapers(id) {
        return Secretary.refreshPapers(id).then(() => this.refreshGraph());
    }

    refreshGraph() {
        var promise = Promise.resolve();
        if (this.state.selectedNode != null) {
            promise = promise.then((_) => Secretary.getPapers(this.state.selectedNode)
                .then((res) => this.setState({
                    selectedData: res
                })));
        }
        return promise.then((_) => Secretary.fetchAll())
            .then((res) => this.setState({
                nodes: res.nodes,
                links: res.links,
            }));
    }

    handleRemoveAuthor(id) {
        this.setState({
            selectedNode: null,
            selectedData: null
        });
        Secretary.delAuthor(id).then(() => this.refreshGraph());
    }

    handleDLPaper(id) {
        Secretary.dlPaper(id)
            .then((_) => this.fetchData(this.state.selectedNode));
    }
}

// ========================================

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Main />);
