/* ═══════════════════════════════════════════════════════════
   app.js – PDF Toolkit Web v3.0
   Frontend logic: upload, thumbnails, page selection, export
   ═══════════════════════════════════════════════════════════ */

// ─── State ───
const state = {
  files: [],          // [{file_id, name, total_pages, selected_pages: Set}]
  mergeOrder: [],     // [{file_id, pageIdx}] – thứ tự trang khi gộp (cập nhật sau Xác nhận)
  selectedIndex: -1,  // index trong state.files của file đang được chọn
  thumbMode: null,    // null | "single" | "all"
};

// ─── Helpers ───
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function toast(msg, type = "info") {
  const box = document.createElement("div");
  box.className = `toast toast-${type}`;
  box.textContent = msg;
  $("#toastContainer").appendChild(box);
  setTimeout(() => { box.style.opacity = "0"; setTimeout(() => box.remove(), 300); }, 3000);
}

function showLoading(text = "Đang xử lý…") {
  $("#loadingText").textContent = text;
  $("#loadingOverlay").classList.remove("hidden");
}
function hideLoading() {
  $("#loadingOverlay").classList.add("hidden");
}

function indicesToDisplay(indices, total) {
  if (!indices || indices.size === 0) return "⚠️ Không có trang nào";
  if (indices.size === total) return `✅ Tất cả (${total} trang)`;
  const sorted = [...indices].sort((a, b) => a - b).map(i => i + 1);
  const parts = [];
  let start = sorted[0], prev = sorted[0];
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k] === prev + 1) { prev = sorted[k]; }
    else { parts.push(start === prev ? `${start}` : `${start}-${prev}`); start = prev = sorted[k]; }
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return `${parts.join(", ")}  (${indices.size} trang)`;
}

function badgeClass(indices, total) {
  if (!indices || indices.size === 0) return "badge-none";
  if (indices.size === total) return "badge-all";
  return "badge-partial";
}

// ─── Upload ───
function triggerUpload() {
  $("#fileInput").click();
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("drag-over");
}
function handleDragLeave(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
}
function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  const files = e.dataTransfer.files;
  if (files.length) handleFiles(files);
}

async function handleFiles(fileList) {
  const formData = new FormData();
  let count = 0;
  for (const f of fileList) {
    if (f.name.toLowerCase().match(/\.(pdf|png|jpg|jpeg)$/i)) {
      formData.append("files", f);
      count++;
    }
  }
  if (count === 0) return toast("Chỉ hỗ trợ file PDF và Hình ảnh!", "warning");

  showLoading("Đang tải lên…");
  try {
    const resp = await fetch("/api/upload", { method: "POST", body: formData });
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }
    const results = await resp.json();
    for (const r of results) {
      state.files.push({
        file_id: r.file_id,
        name: r.name,
        total_pages: r.total_pages,
        selected_pages: new Set(Array.from({ length: r.total_pages }, (_, i) => i)),
      });
    }
    state.mergeOrder = []; // Reset thứ tự sắp xếp khi thêm file mới
    renderFileList();
    toast(`✅ Đã thêm ${results.length} file!`, "success");
  } catch (e) {
    toast(`❌ Lỗi: ${e.message}`, "error");
  } finally {
    hideLoading();
    $("#fileInput").value = "";
  }
}

// ─── File List ───
let draggedFileIndex = null;

function renderFileList() {
  const tbody = $("#fileTableBody");
  const table = $("#fileTable");
  const empty = $("#emptyState");

  if (state.files.length === 0) {
    table.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  table.classList.remove("hidden");
  empty.classList.add("hidden");

  tbody.innerHTML = "";
  state.files.forEach((f, idx) => {
    const tr = document.createElement("tr");
    tr.draggable = true;
    if (idx === state.selectedIndex) tr.classList.add("selected");
    
    tr.onclick = () => { state.selectedIndex = idx; renderFileList(); };
    tr.ondblclick = () => { state.selectedIndex = idx; renderFileList(); showSinglePicker(); };

    // Drag & Drop events
    tr.ondragstart = (e) => {
      draggedFileIndex = idx;
      setTimeout(() => tr.classList.add("dragging"), 0);
    };
    tr.ondragenter = (e) => {
      e.preventDefault();
      if (idx !== draggedFileIndex) tr.classList.add("drag-over");
    };
    tr.ondragleave = (e) => {
      tr.classList.remove("drag-over");
    };
    tr.ondragover = (e) => {
      e.preventDefault();
    };
    tr.ondrop = (e) => {
      e.preventDefault();
      tr.classList.remove("drag-over");
      if (draggedFileIndex === null || draggedFileIndex === idx) return;
      
      const movedItem = state.files.splice(draggedFileIndex, 1)[0];
      state.files.splice(idx, 0, movedItem);
      
      const selectedFile = state.files[state.selectedIndex];
      state.selectedIndex = state.files.indexOf(movedItem === selectedFile ? movedItem : state.files.find(f => f === selectedFile));
      
      draggedFileIndex = null;
      state.mergeOrder = []; // Reset thứ tự sắp xếp trang khi đổi thứ tự file
      renderFileList();
    };
    tr.ondragend = (e) => {
      tr.classList.remove("dragging");
      draggedFileIndex = null;
    };

    const disp = indicesToDisplay(f.selected_pages, f.total_pages);
    const badge = badgeClass(f.selected_pages, f.total_pages);

    tr.innerHTML = `
      <td style="text-align:center;font-weight:600;color:var(--text-secondary)">${idx + 1}</td>
      <td style="font-weight:600">${f.name}</td>
      <td style="text-align:center">${f.total_pages}</td>
      <td><span class="badge ${badge}">${disp}</span></td>
      <td style="text-align:center">
        <button class="btn-delete-row" title="Xóa file này" onclick="event.stopPropagation(); deleteFileIdx(${idx})">❌</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── Delete ───

async function deleteFileIdx(idx) {
  if (idx < 0 || idx >= state.files.length) return;
  const f = state.files[idx];
  await fetch(`/api/files/${f.file_id}`, { method: "DELETE" });
  state.files.splice(idx, 1);
  
  if (state.selectedIndex === idx) {
    state.selectedIndex = Math.min(idx, state.files.length - 1);
  } else if (state.selectedIndex > idx) {
    state.selectedIndex--;
  }
  
  if (state.files.length === 0) state.selectedIndex = -1;
  state.mergeOrder = []; // Reset thứ tự sắp xếp khi xóa file
  renderFileList();
  hideThumbArea();
  toast("Đã xóa file.", "success");
}

async function clearAll() {
  if (state.files.length === 0) return;
  if (!confirm("Xóa tất cả file?")) return;
  await fetch("/api/files/clear", { method: "DELETE" });
  state.files = [];
  state.selectedIndex = -1;
  state.mergeOrder = []; // Reset thứ tự sắp xếp
  renderFileList();
  hideThumbArea();
  toast("Đã xóa tất cả.", "success");
}

// ─── Thumbnail Picker ───
function hideThumbArea() {
  $("#thumbArea").classList.add("hidden");
  $(".file-list-card").classList.remove("hidden");
  state.thumbMode = null;
}

function showSinglePicker() {
  const idx = state.selectedIndex;
  if (idx < 0) return toast("Hãy chọn một file trước!", "warning");
  state.thumbMode = "single";
  const f = state.files[idx];
  $("#thumbTitle").textContent = `📄 ${f.name}  (${f.total_pages} trang)`;
  $(".file-list-card").classList.add("hidden");
  $("#thumbArea").classList.remove("hidden");

  const content = $("#thumbContent");
  content.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "thumb-grid";

  for (let i = 0; i < f.total_pages; i++) {
    const card = createThumbCard(f.file_id, i, f.selected_pages.has(i), "var(--primary)");
    grid.appendChild(card);
  }
  content.appendChild(grid);
}

// File section colors
const FILE_COLORS = ["#03aaad", "#e67e22", "#8e44ad", "#27ae60", "#c0392b", "#2980b9", "#d35400", "#16a085"];

function showAllPicker() {
  if (state.files.length === 0) return toast("Chưa có file nào!", "warning");
  state.thumbMode = "all";

  const totalPages = state.files.reduce((s, f) => s + f.total_pages, 0);
  $("#thumbTitle").textContent = `📋 ${state.files.length} file – tổng ${totalPages} trang`;
  $(".file-list-card").classList.add("hidden");
  $("#thumbArea").classList.remove("hidden");

  const content = $("#thumbContent");
  content.innerHTML = "";

  state.files.forEach((f, fIdx) => {
    const color = FILE_COLORS[fIdx % FILE_COLORS.length];
    const section = document.createElement("div");
    section.className = "file-section";

    // Header
    const hdr = document.createElement("div");
    hdr.className = "file-section-header";
    hdr.style.background = color;
    hdr.innerHTML = `
      <span>📄 File ${fIdx + 1}: ${f.name} (${f.total_pages} trang)</span>
      <div class="section-actions">
        <button style="color:${color}" onclick="selectFileSection(${fIdx}, true)">Chọn cả file</button>
        <button style="color:${color}" onclick="selectFileSection(${fIdx}, false)">Bỏ chọn</button>
      </div>
    `;
    section.appendChild(hdr);

    // Grid
    const grid = document.createElement("div");
    grid.className = "file-section-grid";
    grid.id = `section-grid-${fIdx}`;
    for (let i = 0; i < f.total_pages; i++) {
      const card = createThumbCard(f.file_id, i, f.selected_pages.has(i), color, fIdx);
      grid.appendChild(card);
    }
    section.appendChild(grid);
    content.appendChild(section);
  });
}

function createThumbCard(fileId, pageIdx, checked, borderColor, fileIdx) {
  const card = document.createElement("div");
  card.className = `thumb-card ${checked ? "checked" : "unchecked"}`;
  if (borderColor && checked) card.style.borderColor = borderColor;
  card.draggable = true;
  card.dataset.fileId = fileId;
  card.dataset.pageIdx = pageIdx;
  if (fileIdx !== undefined) card.dataset.fileIdx = fileIdx;

  const img = document.createElement("img");
  img.src = `/api/thumb/${fileId}/${pageIdx}`;
  img.alt = `Trang ${pageIdx + 1}`;
  img.loading = "lazy";

  const label = document.createElement("div");
  label.className = "thumb-label";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = checked;
  cb.dataset.fileId = fileId;
  cb.dataset.pageIdx = pageIdx;
  if (fileIdx !== undefined) cb.dataset.fileIdx = fileIdx;

  const txt = document.createElement("span");
  txt.textContent = `Trang ${pageIdx + 1}`;

  label.appendChild(cb);
  label.appendChild(txt);

  // Nút ▲▼ di chuyển trang
  const moveBox = document.createElement("div");
  moveBox.className = "thumb-move-btns";
  const btnUp = document.createElement("button");
  btnUp.className = "thumb-move-btn";
  btnUp.textContent = "▲";
  btnUp.title = "Di chuyển lên";
  btnUp.addEventListener("click", (e) => { e.stopPropagation(); moveThumbCard(card, -1); });
  const btnDown = document.createElement("button");
  btnDown.className = "thumb-move-btn";
  btnDown.textContent = "▼";
  btnDown.title = "Di chuyển xuống";
  btnDown.addEventListener("click", (e) => { e.stopPropagation(); moveThumbCard(card, 1); });
  moveBox.appendChild(btnUp);
  moveBox.appendChild(btnDown);

  card.appendChild(img);
  card.appendChild(label);
  card.appendChild(moveBox);

  // Toggle on click anywhere on card
  card.addEventListener("click", (e) => {
    if (e.target === cb || e.target.classList.contains("thumb-move-btn")) return;
    cb.checked = !cb.checked;
    updateCardState(card, cb, borderColor);
  });
  cb.addEventListener("change", () => {
    updateCardState(card, cb, borderColor);
  });

  // Drag reorder events
  card.addEventListener("dragstart", (e) => {
    card.classList.add("drag-reorder");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "thumb-reorder");
    _draggedThumb = card;
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("drag-reorder");
    _draggedThumb = null;
    // Xóa tất cả highlight
    document.querySelectorAll(".drag-over-reorder").forEach(el => el.classList.remove("drag-over-reorder"));
  });
  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (_draggedThumb && _draggedThumb !== card) {
      card.classList.add("drag-over-reorder");
    }
  });
  card.addEventListener("dragleave", () => {
    card.classList.remove("drag-over-reorder");
  });
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove("drag-over-reorder");
    if (!_draggedThumb || _draggedThumb === card) return;
    // Chèn card đang kéo vào trước card đích
    const grid = card.parentElement;
    if (!grid) return;
    grid.insertBefore(_draggedThumb, card);
    _draggedThumb = null;
  });

  return card;
}

// Biến tạm cho drag reorder thumbnail
let _draggedThumb = null;

// Hàm di chuyển card lên/xuống bằng nút ▲▼
function moveThumbCard(card, direction) {
  const grid = card.parentElement;
  if (!grid) return;
  const cards = [...grid.children];
  const idx = cards.indexOf(card);
  if (direction === -1 && idx > 0) {
    // Di chuyển lên: chèn trước phần tử phía trên
    grid.insertBefore(card, cards[idx - 1]);
  } else if (direction === 1 && idx < cards.length - 1) {
    // Di chuyển xuống: chèn sau phần tử phía dưới
    const nextNext = cards[idx + 2] || null;
    grid.insertBefore(card, nextNext);
  }
}

function updateCardState(card, cb, borderColor) {
  card.classList.toggle("checked", cb.checked);
  card.classList.toggle("unchecked", !cb.checked);
  card.style.borderColor = cb.checked ? borderColor : "";
}

function selectAllThumbs() {
  $$("#thumbContent input[type=checkbox]").forEach(cb => {
    cb.checked = true;
    const card = cb.closest(".thumb-card");
    card.classList.add("checked");
    card.classList.remove("unchecked");
  });
}

function deselectAllThumbs() {
  $$("#thumbContent input[type=checkbox]").forEach(cb => {
    cb.checked = false;
    const card = cb.closest(".thumb-card");
    card.classList.remove("checked");
    card.classList.add("unchecked");
    card.style.borderColor = "";
  });
}

function selectFileSection(fIdx, selectState) {
  const grid = $(`#section-grid-${fIdx}`);
  if (!grid) return;
  grid.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.checked = selectState;
    const card = cb.closest(".thumb-card");
    card.classList.toggle("checked", selectState);
    card.classList.toggle("unchecked", !selectState);
  });
}

function confirmThumbSelection() {
  // Gather checkbox states and update state.files
  if (state.thumbMode === "single") {
    const idx = state.selectedIndex;
    if (idx < 0) return;
    const f = state.files[idx];
    f.selected_pages = new Set();
    $$("#thumbContent input[type=checkbox]").forEach(cb => {
      if (cb.checked) f.selected_pages.add(parseInt(cb.dataset.pageIdx));
    });
  } else if (state.thumbMode === "all") {
    // Group by file
    $$("#thumbContent input[type=checkbox]").forEach(cb => {
      const fIdx = parseInt(cb.dataset.fileIdx);
      const pIdx = parseInt(cb.dataset.pageIdx);
      if (cb.checked) {
        state.files[fIdx].selected_pages.add(pIdx);
      } else {
        state.files[fIdx].selected_pages.delete(pIdx);
      }
    });
  }

  // ── Xây dựng mergeOrder từ thứ tự DOM thực tế (sau khi kéo thả / di chuyển) ──
  state.mergeOrder = [];
  document.querySelectorAll("#thumbContent .thumb-card").forEach(card => {
    const cb = card.querySelector("input[type=checkbox]");
    if (cb && cb.checked) {
      state.mergeOrder.push({
        file_id: card.dataset.fileId,
        pageIdx: parseInt(card.dataset.pageIdx),
      });
    }
  });

  renderFileList();
  hideThumbArea();
  toast("✅ Đã cập nhật trang được chọn!", "success");
}

// ─── Export Actions ───
function getSelectedFile() {
  if (state.selectedIndex < 0) {
    toast("Hãy chọn một file trước!", "warning");
    return null;
  }
  return state.files[state.selectedIndex];
}

async function doMerge() {
  if (state.files.length === 0) return toast("Chưa có file nào!", "warning");
  const compress = $("#compressToggle")?.checked || false;

  let payload;

  if (state.mergeOrder.length > 0) {
    // ── Dùng mergeOrder (thứ tự do người dùng sắp xếp) ──
    // Gom nhóm theo cụm liên tiếp cùng file_id, giữ nguyên thứ tự xen kẽ
    // VD: A-1, A-2, B-1, A-3 → [{A, [1,2]}, {B, [1]}, {A, [3]}]
    const chunks = [];
    for (const item of state.mergeOrder) {
      const last = chunks[chunks.length - 1];
      if (last && last.file_id === item.file_id) {
        last.pages.push(item.pageIdx);
      } else {
        chunks.push({ file_id: item.file_id, pages: [item.pageIdx] });
      }
    }
    payload = {
      compress,
      files: chunks,
    };
  } else {
    // ── Fallback: thứ tự mặc định (file theo danh sách, trang sorted) ──
    payload = {
      compress,
      files: state.files.map(f => ({
        file_id: f.file_id,
        pages: [...f.selected_pages].sort((a, b) => a - b),
      })),
    };
  }

  const totalPages = payload.files.reduce((s, f) => s + f.pages.length, 0);
  if (totalPages === 0) return toast("Không có trang nào được chọn!", "warning");

  showLoading("Đang gộp file…");
  try {
    const resp = await fetch("/api/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error((await resp.json()).error);
    const blob = await resp.blob();
    const firstFileName = state.files[0].name.replace(/\.pdf$/i, "");
    downloadBlob(blob, `${firstFileName}_gop.pdf`);
    toast(`✅ Đã gộp ${totalPages} trang thành công!`, "success");
  } catch (e) {
    toast(`❌ Lỗi: ${e.message}`, "error");
  } finally {
    hideLoading();
  }
}

async function doSplit() {
  const f = getSelectedFile();
  if (!f) return;
  const pages = [...f.selected_pages].sort((a, b) => a - b);
  if (pages.length === 0) return toast("Không có trang nào được chọn!", "warning");

  const compress = $("#compressToggle")?.checked || false;

  showLoading(`Đang tách ${pages.length} trang…`);
  try {
    const resp = await fetch("/api/split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: f.file_id, pages, compress: compress }),
    });
    if (!resp.ok) throw new Error((await resp.json()).error);
    const blob = await resp.blob();
    const base = f.name.replace(/\.pdf$/i, "");
    downloadBlob(blob, `${base}_tach.zip`);
    toast(`✅ Đã tách ${pages.length} trang!`, "success");
  } catch (e) {
    toast(`❌ Lỗi: ${e.message}`, "error");
  } finally {
    hideLoading();
  }
}

async function doImages() {
  const f = getSelectedFile();
  if (!f) return;
  const pages = [...f.selected_pages].sort((a, b) => a - b);
  if (pages.length === 0) return toast("Không có trang nào được chọn!", "warning");

  showLoading(`Đang xuất ${pages.length} ảnh…`);
  try {
    const resp = await fetch("/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: f.file_id, pages }),
    });
    if (!resp.ok) throw new Error((await resp.json()).error);
    const blob = await resp.blob();
    const base = f.name.replace(/\.pdf$/i, "");
    downloadBlob(blob, `${base}_anh.zip`);
    toast(`✅ Đã xuất ${pages.length} ảnh!`, "success");
  } catch (e) {
    toast(`❌ Lỗi: ${e.message}`, "error");
  } finally {
    hideLoading();
  }
}

async function doWord() {
  const f = getSelectedFile();
  if (!f) return;
  const pages = [...f.selected_pages].sort((a, b) => a - b);
  if (pages.length === 0) return toast("Không có trang nào được chọn!", "warning");
  const ocrModeElement = $("#ocrMode");
  const ocr_mode = ocrModeElement ? ocrModeElement.value : "none";

  let modeText = "";
  if (ocr_mode === "basic") modeText = " (OCR Thường)";
  if (ocr_mode === "advanced") modeText = " (OCR Nâng cao)";

  showLoading(`Đang chuyển ${pages.length} trang sang Word${modeText}…`);
  try {
    const resp = await fetch("/api/word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: f.file_id, pages, ocr_mode }),
    });
    if (!resp.ok) throw new Error((await resp.json()).error);
    const blob = await resp.blob();
    const base = f.name.replace(/\.pdf$/i, "");
    downloadBlob(blob, `${base}.docx`);
    toast("✅ Đã chuyển sang Word thành công!", "success");
  } catch (e) {
    toast(`❌ Lỗi: ${e.message}`, "error");
  } finally {
    hideLoading();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function doCompress() {
  const f = getSelectedFile();
  if (!f) return;
  const pages = [...f.selected_pages].sort((a, b) => a - b);
  if (pages.length === 0) return toast("Không có trang nào được chọn!", "warning");

  showLoading(`Đang nén file (giữ lại ${pages.length} trang)…`);
  try {
    const resp = await fetch("/api/compress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: f.file_id, pages }),
    });
    if (!resp.ok) throw new Error((await resp.json()).error);
    const blob = await resp.blob();
    const base = f.name.replace(/\.pdf$/i, "");
    downloadBlob(blob, `${base}_nen.pdf`);
    toast("✅ Đã nén xong!", "success");
  } catch (e) {
    toast(`❌ Lỗi: ${e.message}`, "error");
  } finally {
    hideLoading();
  }
}

async function doExcel() {
  const f = getSelectedFile();
  if (!f) return;
  const pages = [...f.selected_pages].sort((a, b) => a - b);
  if (pages.length === 0) return toast("Không có trang nào được chọn!", "warning");

  showLoading(`Đang xuất ${pages.length} trang sang Excel…`);
  try {
    const resp = await fetch("/api/excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: f.file_id, pages }),
    });
    if (!resp.ok) throw new Error((await resp.json()).error);
    const blob = await resp.blob();
    const base = f.name.replace(/\.pdf$/i, "");
    downloadBlob(blob, `${base}.xlsx`);
    toast("✅ Đã xuất sang Excel thành công!", "success");
  } catch (e) {
    toast(`❌ Lỗi: ${e.message}`, "error");
  } finally {
    hideLoading();
  }
}
