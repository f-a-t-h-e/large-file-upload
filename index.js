const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const Busboy = require("busboy");

const uploadsDirPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDirPath)) {
  fs.mkdirSync(uploadsDirPath);
}

app.use(express.static(path.join(__dirname, "public")));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/**
 * @type {{[k:string]:{uploadedSize:number}}}
 */
let uploadsTracker = {};

app.get(
  "/upload",
  /**
   *
   * @param {Request} req
   * @param {Response} res
   * @returns {Response}
   */
  async (req, res) => {
    // In production you need to validate this using database or something
    const id = req.headers["x-file-id"];
    const size = parseInt(String(req.headers["x-file-size"]), 10);

    if (isNaN(size)) {
      return res.status(400).send("Found no proper size header");
    }
    if (typeof id !== "string" || id == "") {
      return res.status(400).send("Found no proper id header");
    }
    try {
      const uploadedSize = await getSavedTracking(id);
      return res.status(200).send({
        success: true,
        status: 200,
        data: {
          status: uploadedSize >= size ? "COMPLETED" : "RESUMABLE",
          uploadedSize: uploadedSize,
        },
      });
    } catch (error) {
      return res.status(200).send({
        success: false,
        status: 500,
      });
    }
  }
);

app.post("/upload", async (req, res) => {
  // Get user inputs
  // using query
  // const chunkIndex = parseInt(req.query.chunkIndex);
  // const totalChunks = parseInt(req.query.totalChunks);
  // const filename = req.query.filename;
  // using headers
  const range = req.headers["content-range"];

  if (typeof range !== "string") {
    return res.status(400).send(`Invalid header "content-range"`);
  }
  
  let [_, start, end, size] = range.match(/(\d+)-(\d+)\/(\d+)/);
  (start = +start), (end = +end), (size = +size);
  const id = req.headers["x-file-id"];

  if (typeof id !== "string" || id == "") {
    return res.status(400).send("Found no proper id header");
  }
  const savedStart = await getSavedTracking(id);
  if (start !== savedStart) {
    return res.status(200).send({
      success: true,
      status: 200,
      data: {
        status: savedStart < size ? "RESUMABLE" : "COMPLETED",
        uploadedSize: savedStart,
      },
    });
  }
  // File path
  const filePath = path.join(uploadsDirPath, `${id}`);

  const busboy = Busboy({ headers: req.headers });

  const fileStream = fs.createWriteStream(filePath, {
    flags: start == 0 ? "w" : "r+",
    start: start
  });

  busboy.on("file", (_name, file) => {
    file.pipe(fileStream);
  });

  busboy.on("close", () => {
    uploadsTracker[id].uploadedSize = end;
    res.status(200).send({
      success: true,
      status: 200,
      data: {
        status: end == size ? "COMPLETED" : "RESUMABLE",
        uploadedSize: end,
      },
    });
  });

  busboy.on("error", (err) => {
    res.status(200).send({
      success: false,
      status: 500,
    });
  });

  req.pipe(busboy);
});

/**
 *
 * @param {string} id
 * @returns {Promise<number>}
 */
async function getSavedTracking(id) {
  if (uploadsTracker[id] && typeof uploadsTracker[id].uploadedSize == "number") {
    return uploadsTracker[id].uploadedSize;
  } else {
    uploadsTracker[id] = {};
  }
  const filePath = path.join(uploadsDirPath, id);
  return new Promise((resolve, reject) => {
    fs.stat(filePath, function (err, stats) {
      if (err) {
        if ("ENOENT" == err.code) {
          //file did'nt exist so for example send 404 to client
          uploadsTracker[id].uploadedSize = 0;
          return resolve(0);
        } else {
          //it is a server error so for example send 500 to client
          return reject(err);
        }
      } else {
        //every thing was ok so for example you can read it and send it to client
        uploadsTracker[id].uploadedSize = stats.size;
        return resolve(stats.size);
      }
    });
  });
}

app.listen(3000, () => {
  console.log("Server is listening on port 3000");
  console.log("http://localhost:3000");
});
