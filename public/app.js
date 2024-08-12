/**
 * @type {HTMLInputElement}
 */
const fileInput = document.getElementById("fileInput");
const chunkSize = 5 * 1024 * 1024; // 5MB per chunk
const progressBar = document.getElementById("progress-bar");
const submitBtn = document.getElementById("submit-btn");
let paused = false;
const data = {
  paused: false,
  _acceptNew: true,
  get acceptNew() {
    return this._acceptNew;
  },
  set acceptNew(val) {
    this._acceptNew = val;
    if (val) {
      fileInput.disabled = false;
    } else {
      fileInput.disabled = true;
    }
  },
};

function pause() {
  data.paused = true;
  submitBtn.textContent = "Continue";
}
function resume() {
  if (fileInput.files[0]) {
    data.paused = false;
    submitBtn.textContent = "Pause";
    uploadFile(fileInput.files[0]);
  } else {
    reset();
  }
}
function reset() {
  data.paused = false;
  data.acceptNew = true;
  submitBtn.textContent = "Upload";
  updateProgress(0);
}
/**
 *
 * @param {number} progress
 */
function updateProgress(progress) {
  progress = progress * 100;
  if (typeof progress !== "number") {
    return;
  }
  let p = progress.toFixed(2);
  if (p - Math.floor(p) < 0.01) {
    p = Math.floor(p);
  }
  progressBar.style.setProperty("--progress", `${p}%`);
  progressBar.setAttribute("data-progress", `${p}%`);
}

/**
 * Get the last uploaded pointer
 * @param {string} name
 * @param {number} size
 * @returns {Promise<number|null>}
 */
async function getSaved(name, size) {
  try {
    /**
     * @type {TStates}
     */
    const res = await (
      await fetch("/upload", {
        headers: {
          "x-file-id": name,
          "x-file-size": size,
        },
        cache: "no-cache",
      })
    ).json();

    if (res.success) {
      return res.data.uploadedSize;
    } else {
      console.log(res);
      return null;
    }
  } catch (error) {
    console.log(error);
    return null;
  }
}

/**
 *
 * @param {File} file
 */
async function uploadFile(file) {
  if (data.paused) {
    return;
  }
  let pointerStart = await getSaved(file.name, file.size);
  if (typeof pointerStart !== "number") {
    alert("Something went wrong, check the console!");
    return;
  }
  let pointerEnd = 0;
  updateProgress(pointerStart / file.size);
  const maxRetries = 3;

  function uploadChunk(retries = 0) {
    if (data.paused) {
      return;
    }

    pointerEnd = Math.min(pointerStart + chunkSize, file.size);
    const chunk = file.slice(pointerStart, pointerEnd);
    const formData = new FormData();
    formData.append("chunk", chunk);
    fetch(`/upload`, {
      method: "POST",
      body: formData,
      headers: {
        "content-range": `bytes ${pointerStart}-${pointerEnd}/${file.size}`,
        "x-file-id": file.name,
      },
    })
      .then((response) => response.json())
      .then(
        /**
         *
         * @param {TStates} res
         */
        (res) => {
          if (!res.success) {
            // retry ?
            uploadChunk(retries + 1); // Retry the chunk
          } else {
            pointerStart = res.data.uploadedSize;
            updateProgress(pointerStart / file.size);

            if (pointerStart < file.size) {
              uploadChunk();
            } else {
              reset();
              updateProgress(1);
              console.log("Upload completed");
            }
          }
        }
      )
      .catch((error) => {
        console.error("Error uploading chunk:", error);
        if (retries < maxRetries) {
          console.log(`Retrying chunk ${(pointerStart / file.size) * chunkSize}, attempt ${retries + 1}`);
          uploadChunk(retries + 1); // Retry the chunk
        } else {
          console.error(
            `Failed to upload chunk ${(pointerStart / file.size) * chunkSize} after ${maxRetries} attempts`
          );
        }
      });
  }

  if (pointerStart < file.size) {
    uploadChunk();
  } else {
    alert("File is already uploaded");
  }
}

// Example usage
/**
 * @type {HTMLFormElement}
 */
const form = document.getElementById("form");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (fileInput.files[0]) {
    if (data.paused) {
      resume();
    } else if (data.acceptNew) {
      data.acceptNew = false;
      resume();
    } else {
      pause();
    }
  } else {
    alert("Please select a file");
  }
});

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];

  if (file) {
    if (data.acceptNew) {
    } else {
      event.preventDefault();
      console.log(`Can't accept a new file now`);
    }
  }
});
