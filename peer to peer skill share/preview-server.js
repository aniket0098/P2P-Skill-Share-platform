const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const mime = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
http.createServer((request, response) => {
    const pathname = decodeURIComponent(request.url.split("?")[0] || "/");
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.join(root, relative);
    fs.readFile(file, (error, data) => {
        response.writeHead(error ? 404 : 200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
        response.end(error ? "Not found" : data);
    });
}).listen(8123, "127.0.0.1");
