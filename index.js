const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const http = require('follow-redirects').http;
const axios = require('axios');
const parseString = require('xml2js').parseString;
const cors = require('cors');
var jsonData = require('./data.json');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    origin: '*'
}));

app.use(express.static(path.join(__dirname, "frontend", "build")));

app.use(bodyParser.json());

function updateJson() {
    const data = JSON.stringify(jsonData);
    fs.writeFileSync('./data.json', data, (err) => {
        if (err) {
            throw err;
        }
    });
};

app.get("/api/get", async (_, res) => {
    const cleanedData = {
        nodes: jsonData.authors.map(x => ({ id: x.id, name: x.name })),
        links: jsonData.collabs
    };
    res.send(cleanedData);
});

app.post("/api/get/papers", async (req, res) => {
    var entry = jsonData.authors.find(x => x.id == req.body.id);

    const cleanedData = {
        author: {
            id: entry.id,
            name: entry.name
        },
        papers: jsonData.papers.filter(x => x.aIDs.includes(entry.id))
    };
    res.send(cleanedData);
});

function tryAddLink(source, target) {
    if (source == target) return;
    if (jsonData.collabs.every((x) =>
        !((x.source == source && x.target == target) || (x.source == target && x.target == source))
    )) {
        jsonData.collabs.push({
            source: source,
            target: target
        });
    }
}

function tryAddPaper(aId, id, name, link) {
    var entry = null;
    jsonData.papers.forEach((x) => {
        if (x.id == id) {
            entry = x;
            x.URL = link;
            if (!x.aIDs.includes(aId))
                x.aIDs.push(aId);
        }
    });
    if (entry == null) {
        entry = {
            id: id,
            name: name,
            URL: link,
            offline: false,
            path: "",
            aIDs: [aId]
        };
        jsonData.papers.push(entry);
    }
    entry.aIDs.forEach((x) => {
        entry.aIDs.forEach((y) => {
            tryAddLink(x, y);
        });
    });
};

app.post("/api/add", async (req, res) => {
    var entry = jsonData.authors.find(x => x.name == req.body.name);

    if (entry == undefined) {
        var lastId = 0;
        jsonData.authors.forEach((x) => { lastId = Math.max(lastId, x.id); });
        entry = {
            id: lastId + 1,
            name: req.body.name,
            cats: req.body.cats
        };
        jsonData.authors.push(entry);
        updateJson();
    }

    res.sendStatus(200);
});

app.post("/api/fetch", async (req, res) => {
    var entry = jsonData.authors.find(x => x.id == req.body.id);

    // Fetch paper list from Arxiv
    var toAdd = true;
    var start = 0;
    while (toAdd) {
        toAdd = false;
        await axios(`http://export.arxiv.org/api/query?search_query=au:\"${entry.name}\"+AND+(${entry.cats})&sortBy=lastUpdatedDate&sortOrder=descending&start=${start}&max_results=10`)
            .then(res => {
                parseString(res.data, (_, result) => {
                    var qAuthor = result;
                    if ('entry' in qAuthor.feed) {
                        qAuthor.feed.entry.forEach((x) => {
                            toAdd = true;
                            var id = x.id[0];
                            id = id.substr(id.lastIndexOf('/') + 1);
                            id = id.substr(0, id.lastIndexOf('v'));
                            var title = x.title[0];
                            var link = null;
                            x.link.forEach((y) => { if (y['$'].title == 'pdf') link = y['$'].href; });
                            tryAddPaper(entry.id, id, title, link);
                        });
                    }
                });
            })
            .catch(error => {
                console.error(error);
                res.sendStatus(500);
            });
        start = start + 10;
        await delay(3000);
    }

    updateJson();

    res.sendStatus(200);
});

app.post("/api/del", async (req, res) => {
    jsonData.authors = jsonData.authors.filter((x) => x.id != req.body.id);
    jsonData.papers = jsonData.papers
        .map((x) => ({
            id: x.id,
            name: x.name,
            URL: x.link,
            offline: x.offline,
            path: x.path,
            aIDs: x.aIDs.filter((y) => y != req.body.id)
        }))
        .filter((x) => x.aIDs.length != 0);
    jsonData.collabs = jsonData.collabs.filter((x) => x.source != req.body.id && x.target != req.body.id);

    updateJson();
    res.sendStatus(200);
});

app.get("/papers/*", async (req, res) => {
    res.sendFile(path.join(__dirname, req.originalUrl));
});

app.get("*", async (_, res) => {
    res.sendFile(path.join(__dirname, "frontend", "build", "index.html"));
});

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

app.post("/api/download", async (req, resp) => {
    var entry = jsonData.papers.find(x => x.id == req.body.id);

    if (entry === undefined) {
        resp.sendStatus(500);
        return;
    }

    var dir = './papers/' + entry.id + '.pdf'

    // TODO chage to something sensible
    const uAgent = 'Python-urllib/3.6'

    const options = {
        headers: {
            'User-Agent': uAgent,
        }
    };

    http.get(entry.URL, options, (res) => {
        const writeStream = fs.createWriteStream(dir);
        res.pipe(writeStream);

        writeStream.on("finish", () => {
            writeStream.close();
            console.log("Download Completed", entry.id);
            entry.offline = true
            entry.path = dir
            updateJson()
            resp.sendStatus(200);
        });
    });
});

app.listen(PORT,
    (server) => console.log('server is running on http://localhost:%s', PORT));