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

function PaperEntry({ handleMouseOver, handleDL, paper }) {
    return <ListGroup.Item
        onMouseEnter={() => handleMouseOver(paper.aIDs)}
        onMouseLeave={() => handleMouseOver([])}
        key={paper.id}>
        <div>
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

function PaperBar({ data, handleRefreshPapers, handleDLPaper, handleMouseOver, handleRemoveAuthor }) {
    if (data === null) {
        return <div></div>;
    }

    function renderPaperEntry(paper) {
        return (<PaperEntry paper={paper} handleDL={handleDLPaper} handleMouseOver={handleMouseOver} />);
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

class AddAuthorForm extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            name: "",
            cats: "",
            show: false
        };

        this.handleChange = this.handleChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    handleChange(e) {
        const target = e.target;
        const name = target.name;
        this.setState({
            [name]: target.value
        });
    }

    handleSubmit(e) {
        e.preventDefault();
        this.props.call(this.state.name, this.state.cats);
    }

    render() {
        const handleClose = () => this.setState({ show: false });
        const handleShow = () => this.setState({ show: true });
        return (
            <>
                <Button variant="primary" onClick={handleShow}>
                    Add Author
                </Button>

                <Modal show={this.state.show} onHide={handleClose}>
                    <Modal.Header closeButton>
                        <Modal.Title>Add an author</Modal.Title>
                    </Modal.Header>
                    <form onSubmit={(e) => { this.handleSubmit(e); handleClose(); }}>
                        <Modal.Body>
                            <h> Author: </h>
                            <input
                                name='name'
                                onChange={this.handleChange}
                                value={this.state.name} />
                            <br />
                            <h> Categories: </h>
                            <input
                                name='cats'
                                onChange={this.handleChange}
                                value={this.state.cats} />
                        </Modal.Body>
                        <Modal.Footer>
                            <Button variant="primary" type="submit">
                                Add
                            </Button>
                        </Modal.Footer>
                    </form>
                </Modal>
            </>
        );
    }
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
        };
        this.handleNodeClick = this.handleNodeClick.bind(this);
        this.handleMouseOver = this.handleMouseOver.bind(this);
        this.handleAddAuthor = this.handleAddAuthor.bind(this);
        this.handleRefreshPapers = this.handleRefreshPapers.bind(this);
        this.handleRemoveAuthor = this.handleRemoveAuthor.bind(this);
        this.handleDLPaper = this.handleDLPaper.bind(this);
    }

    componentDidMount() {
        Secretary.fetchAll()
            .then((res) => this.setState({
                nodes: res.nodes,
                links: res.links,
            }));
    }

    render() {
        return (
            <div className="App">
                <header className="App-header">
                    PaperNet
                </header>
                <div>
                    <section className="split Main">
                        <ForceGraph
                            handleClick={this.handleNodeClick}
                            nodes={this.state.nodes}
                            links={this.state.links}
                            highlightedNodes={this.state.highlightedNodes} />
                        <AddAuthorForm call={this.handleAddAuthor} />
                    </section>
                    <section className="split Directory">
                        <PaperBar
                            data={this.state.selectedData}
                            handleRefreshPapers={this.handleRefreshPapers}
                            handleDLPaper={this.handleDLPaper}
                            handleMouseOver={this.handleMouseOver}
                            handleRemoveAuthor={this.handleRemoveAuthor}
                        />
                    </section>
                </div>
            </div>
        );
    }

    fetchData(id) {
        if (id === null) {
            this.setState({
                selectedData: null
            });
        } else {
            Secretary.getPapers(id)
                .then((res) =>
                    this.setState({
                        selectedData: res
                    }));
        }
    }

    handleAddAuthor(name, cats) {
        Secretary.addAuthor(name, cats)
            .then((_) => Secretary.fetchAll())
            .then((res) => this.setState({
                nodes: res.nodes,
                links: res.links,
            }));
    }

    handleNodeClick(id) {
        this.setState({
            selectedNode: id
        });
        this.fetchData(id);
    }

    handleMouseOver(aIDs) {
        this.setState({
            highlightedNodes: aIDs
        });
    }

    handleRefreshPapers(id) {
        Secretary.refreshPapers(id)
            .then((_) => Secretary.getPapers(id)
                .then((res) => this.setState({
                    selectedData: res
                })))
            .then((_) => Secretary.fetchAll())
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
        Secretary.delAuthor(id)
            .then((_) => Secretary.fetchAll())
            .then((res) => this.setState({
                nodes: res.nodes,
                links: res.links,
            }));
    }

    handleDLPaper(id) {
        Secretary.dlPaper(id)
            .then((_) => this.fetchData(this.state.selectedNode));
    }
}

// ========================================

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Main />);
