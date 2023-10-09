# Papernet

A simple web app to visualize authors, papers and collaborations.
It scrapes all data from arxiv.

![Screenshot](https://github.com/funkytori/papernet/assets/2690998/84d2271f-1d22-41a9-88f8-bcced6bb5ebb)

## Available Scripts

In the project directory, you can run:

### `npm install`

Installs the required dependencies and scripts for backend and frontend.

### `npm start`

Runs the app in development mode.

It compiles the frontend, then runs the backend.
Open [http://localhost:3001](http://localhost:3001) to view it in your browser.

## How to ...

### add an author

Click "Add author" -> fill in full name -> fill in the needed subjects (comma separated, short form, arxiv style) -> click "Add"

### view an author's papers

Click on the author's node / row.

### update an author's paper list

Click on the author's node / row -> click "Refresh".

### update everyone's paper list

Click on "Refresh all".

Refresh takes long as to not spam arxiv.

### remove an author

Click on the author's node / row -> click "Remove".
