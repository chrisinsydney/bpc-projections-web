(() => {
  const { FFmpeg } = FFmpegWASM;
  const { fetchFile } = FFmpegUtil;

  const els = {
    pickImage: document.getElementById("pickImage"),
    pickAudio: document.getElementById("pickAudio"),
    imageInput: document.getElementById("imageInput"),
    audioInput: document.getElementById("audioInput"),
    imageName: document.getElementById("imageName"),
    audioName: document.getElementById("audioName"),
    dropZone: document.getElementById("dropZone"),
    dropReady: document.getElementById("dropReady"),
    status: document.getElementById("status"),
    console: document.getElementById("console"),
    copyLog: document.getElementById("copyLog"),
    convert: document.getElementById("convert"),
    download: document.getElementById("download"),
    hint: document.getElementById("hint"),
  };

  let imageFile = null;
  let audioFile = null;
  let ffmpeg = null;
  let lastDownloadURL = null;
  let isConverting = false;

  function setStatus(text) { els.status.textContent = text; }

  function appendLog(chunk) {
    if (els.console.textContent === "(No output yet)") els.console.textContent = "";
    els.console.textContent += chunk;
    els.console.scrollTop = els.console.scrollHeight;
    els.copyLog.disabled = els.console.textContent.length === 0;
  }

  function resetLog() {
    els.console.textContent = "(No output yet)";
    els.copyLog.disabled = true;
  }

  function updateReadiness() {
    const ready = imageFile && audioFile;
    els.convert.disabled = !ready || isConverting;
    els.hint.hidden = !!ready;
    els.dropReady.textContent = ready ? "✅ Ready" : "";
  }

  function setImage(file) {
    imageFile = file;
    els.imageName.textContent = file ? file.name : "No image selected";
    updateReadiness();
  }

  function setAudio(file) {
    audioFile = file;
    els.audioName.textContent = file ? file.name : "No audio selected";
    updateReadiness();
  }

  function classifyFile(file) {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("audio/")) return "audio";
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(ext)) return "image";
    if (["mp3", "wav", "aac", "m4a", "flac", "ogg"].includes(ext)) return "audio";
    return null;
  }

  function acceptFiles(fileList) {
    for (const file of fileList) {
      const kind = classifyFile(file);
      if (kind === "image") setImage(file);
      else if (kind === "audio") setAudio(file);
      else setStatus(`⚠️ Unsupported file: ${file.name}`);
    }
  }

  // File pickers
  els.pickImage.addEventListener("click", () => els.imageInput.click());
  els.pickAudio.addEventListener("click", () => els.audioInput.click());
  els.imageInput.addEventListener("change", (e) => {
    if (e.target.files[0]) setImage(e.target.files[0]);
  });
  els.audioInput.addEventListener("change", (e) => {
    if (e.target.files[0]) setAudio(e.target.files[0]);
  });

  // Drag & drop
  ["dragenter", "dragover"].forEach((ev) => {
    els.dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      els.dropZone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    els.dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      els.dropZone.classList.remove("dragover");
    });
  });
  els.dropZone.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) acceptFiles(e.dataTransfer.files);
  });

  // Copy console
  els.copyLog.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.console.textContent);
      setStatus("Console copied.");
    } catch {
      setStatus("❌ Copy failed.");
    }
  });

  async function loadFFmpeg() {
    if (ffmpeg) return ffmpeg;
    setStatus("Loading ffmpeg… (first run downloads ~30 MB)");
    ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => appendLog(message + "\n"));
    ffmpeg.on("progress", ({ progress }) => {
      if (progress >= 0 && progress <= 1) {
        setStatus(`Running ffmpeg… ${Math.round(progress * 100)}%`);
      }
    });
    await ffmpeg.load({
      coreURL: new URL("vendor/ffmpeg-core.js", location.href).href,
      wasmURL: new URL("vendor/ffmpeg-core.wasm", location.href).href,
    });
    return ffmpeg;
  }

  function dateStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }

  async function convert() {
    if (!imageFile || !audioFile || isConverting) return;
    isConverting = true;
    updateReadiness();
    els.convert.textContent = "Converting…";
    resetLog();
    els.download.hidden = true;
    if (lastDownloadURL) {
      URL.revokeObjectURL(lastDownloadURL);
      lastDownloadURL = null;
    }

    try {
      const ff = await loadFFmpeg();

      const imageExt = (imageFile.name.split(".").pop() || "png").toLowerCase();
      const audioExt = (audioFile.name.split(".").pop() || "mp3").toLowerCase();
      const imageIn = `input_image.${imageExt}`;
      const audioIn = `input_audio.${audioExt}`;
      const outName = `output_${dateStamp()}.mp4`;

      setStatus("Writing files…");
      await ff.writeFile(imageIn, await fetchFile(imageFile));
      await ff.writeFile(audioIn, await fetchFile(audioFile));

      setStatus("Running ffmpeg…");
      const code = await ff.exec([
        "-y",
        "-loop", "1",
        "-i", imageIn,
        "-i", audioIn,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        outName,
      ]);

      if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);

      const data = await ff.readFile(outName);
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      lastDownloadURL = URL.createObjectURL(blob);
      els.download.href = lastDownloadURL;
      els.download.download = outName;
      els.download.hidden = false;
      setStatus(`✅ Done: ${outName} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);

      // Clean up virtual FS
      await ff.deleteFile(imageIn).catch(() => {});
      await ff.deleteFile(audioIn).catch(() => {});
      await ff.deleteFile(outName).catch(() => {});
    } catch (err) {
      setStatus(`❌ ${err.message || err}`);
      appendLog(`\n[Error] ${err.message || err}\n`);
    } finally {
      isConverting = false;
      els.convert.textContent = "Convert";
      updateReadiness();
    }
  }

  els.convert.addEventListener("click", convert);
})();
