const fs = require('fs');
const path = require('path');
let name = process.argv[2];
let id = (path.parse(name.toString()).name).split('_').pop();
// console.log(id);
const File = fs.createWriteStream('./video.stream.json');
File.write(`
{
  "name": "video.stream",
  "description": "Video play to smart TV",
  "path": "VideoStream.bat",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${id}/"
  ]
}
`);