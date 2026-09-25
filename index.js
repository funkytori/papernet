const express = require('express');
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
// Serve downloaded PDFs from a fixed, known directory. Using express.static
// (instead of manually joining req.originalUrl onto __dirname) means a
// request path containing "../" can't be used to read files outside of
// ./papers.
app.use('/papers', express.static(path.join(__dirname, "papers")));

// body-parser's JSON middleware has been part of Express itself since 4.16,
// so the separate dependency is no longer needed.
app.use(express.json());

function normalizeName(name) {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function updateJson() {
    // writeFileSync is synchronous and throws on failure; it does not take a
    // callback, so the previous (err) => {...} argument was silently ignored.
    try {
        fs.writeFileSync('./data.json', JSON.stringify(jsonData));
    } catch (err) {
        console.error('Failed to persist data.json:', err);
    }
}

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

app.get("/api/get", async (_, res) => {
    const cleanedData = {
        nodes: jsonData.authors.map(x => ({ id: x.id, name: x.name })),
        links: jsonData.collabs
    };
    res.send(cleanedData);
});

app.post("/api/get/papers", async (req, res) => {
    const entry = jsonData.authors.find(x => x.id == req.body.id);
    if (!entry) {
        return res.sendStatus(404);
    }

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
    const name = (req.body.name || '').trim();
    if (!name) {
        return res.sendStatus(400);
    }

    // Compare names trimmed and case-insensitively so "Terence Tao" and
    // "terence tao " don't end up as two different authors.
    const entry = jsonData.authors.find(x => normalizeName(x.name) === normalizeName(name));

    if (entry === undefined) {
        var lastId = 0;
        jsonData.authors.forEach((x) => { lastId = Math.max(lastId, x.id); });
        jsonData.authors.push({
            id: lastId + 1,
            name: name,
            cats: req.body.cats
        });
        updateJson();
    }

    res.sendStatus(200);
});

app.post("/api/fetch", async (req, res) => {
    const entry = jsonData.authors.find(x => x.id == req.body.id);
    if (!entry) {
        return res.sendStatus(404);
    }

    // Arxiv's search syntax expects each category prefixed with "cat:" and
    // joined with OR, e.g. (cat:math.NT OR cat:math.CO). A raw
    // comma-separated string ("math.NT, math.CO") does not filter correctly.
    const catQuery = (entry.cats || '')
        .split(',')
        .map(c => c.trim())
        .filter(Boolean)
        .map(c => `cat:${c}`)
        .join('+OR+');

    let toAdd = true;
    let start = 0;
    let hadError = false;

    // Fetch paper list from Arxiv, one page at a time. Arxiv asks API
    // consumers not to send more than one request every few seconds, hence
    // the delay between pages.
    while (toAdd && !hadError) {
        toAdd = false;
        try {
            const response = await axios(
                `http://export.arxiv.org/api/query?search_query=au:"${entry.name}"+AND+(${catQuery})&sortBy=lastUpdatedDate&sortOrder=descending&start=${start}&max_results=10`
            );

            await new Promise((resolve, reject) => {
                parseString(response.data, (err, result) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    const qAuthor = result;
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
                    resolve();
                });
            });
        } catch (error) {
            // Previously, an error here logged and sent a 500 but did not
            // stop the loop or return, so execution fell through to
            // updateJson() + res.sendStatus(200) afterwards, which would
            // throw "ERR_HTTP_HEADERS_SENT" because two responses were sent
            // for the same request. We now stop the loop and only respond
            // once.
            console.error('Failed to fetch papers for author %s:', entry.name, error);
            hadError = true;
            break;
        }

        start = start + 10;
        if (toAdd) {
            await delay(3000);
        }
    }

    updateJson();

    if (hadError) {
        return res.sendStatus(500);
    }
    res.sendStatus(200);
});

app.post("/api/del", async (req, res) => {
    const authorExists = jsonData.authors.some(x => x.id == req.body.id);
    if (!authorExists) {
        return res.sendStatus(404);
    }

    jsonData.authors = jsonData.authors.filter((x) => x.id != req.body.id);
    jsonData.papers = jsonData.papers
        .map((x) => ({
            id: x.id,
            name: x.name,
            // This previously read x.link, which does not exist on paper
            // entries (they store URL). Every author deletion was silently
            // wiping the download/open-online link on every remaining paper.
            URL: x.URL,
            offline: x.offline,
            path: x.path,
            aIDs: x.aIDs.filter((y) => y != req.body.id)
        }))
        .filter((x) => x.aIDs.length != 0);
    jsonData.collabs = jsonData.collabs.filter((x) => x.source != req.body.id && x.target != req.body.id);

    updateJson();
    res.sendStatus(200);
});

app.post("/api/download", async (req, resp) => {
    var entry = jsonData.papers.find(x => x.id == req.body.id);

    if (entry === undefined) {
        resp.sendStatus(404);
        return;
    }

    var dir = './papers/' + entry.id + '.pdf'

    // TODO change to something sensible
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
    }).on('error', (err) => {
        console.error('Failed to download paper %s:', entry.id, err);
        resp.sendStatus(502);
    });
});

app.get("*", async (_, res) => {
    res.sendFile(path.join(__dirname, "frontend", "build", "index.html"));
});

app.listen(PORT, () => console.log('server is running on http://localhost:%s', PORT));