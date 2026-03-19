var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => LiveFormulasPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// ui.ts
var import_obsidian2 = require("obsidian");

// math.ts
var evaluateMath = (formula, tableData, depth = 0) => {
  if (depth > 20)
    return 0;
  const getValue = (cellId) => {
    const raw = tableData[cellId];
    if (typeof raw === "number")
      return raw;
    if (typeof raw === "string") {
      if (raw.startsWith("="))
        return evaluateMath(raw, tableData, depth + 1);
      const parsed = parseFloat(raw.replace(/,/g, ""));
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };
  let expression = formula.substring(1).toUpperCase();
  expression = expression.replace(/SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g, (match, startCol, startRowStr, endCol, endRowStr) => {
    const startRow = parseInt(startRowStr, 10);
    const endRow = parseInt(endRowStr, 10);
    let total = 0;
    for (let r = startRow; r <= endRow; r++) {
      total += getValue(`${startCol}${r}`);
    }
    return total.toString();
  });
  expression = expression.replace(/SUM\(([^)]+)\)/g, (match, argsStr) => {
    const args = argsStr.split(",").map((s) => s.trim());
    const total = args.reduce((sum, cellId) => sum + getValue(cellId), 0);
    return total.toString();
  });
  expression = expression.replace(/[A-Z]+\d+/g, (match) => {
    return getValue(match).toString();
  });
  try {
    const sanitized = expression.replace(/[^0-9+\-*/(). ]/g, "");
    const result = new Function("return " + sanitized)();
    return isNaN(result) ? 0 : result;
  } catch (e) {
    console.error("Live Formulas Math Error:", formula, e);
    return 0;
  }
};

// toolbar.ts
var import_obsidian = require("obsidian");
var TableToolbar = class {
  constructor(parent, onFormat) {
    this.onFormat = onFormat;
    this.activeCellId = null;
    this.activeInput = null;
    this.el = parent.createEl("div", {
      attr: { style: "position: absolute; display: none; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 4px; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.15); gap: 4px; align-items: center;" }
    });
    this.buildButtons();
  }
  buildButtons() {
    const createBtn = (text, onClick, bold = false) => {
      const btn = this.el.createEl("button", {
        text,
        attr: { style: `background: transparent; border: none; cursor: pointer; padding: 4px 8px; border-radius: 4px; color: var(--text-normal); font-size: 13px; ${bold ? "font-weight: bold;" : ""}` }
      });
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        onClick(e);
      });
    };
    createBtn("B", () => this.onFormat("bold", true), true);
    createBtn("$", (e) => this.onFormat("type", "currency"));
    createBtn("fx", (e) => {
      const menu = new import_obsidian.Menu();
      menu.addItem((i) => i.setTitle("Sum Range").onClick(() => {
        if (this.activeInput)
          this.activeInput.value = "=SUM(B1:B5)";
      }));
      menu.addItem((i) => i.setTitle("Basic Multiply").onClick(() => {
        if (this.activeInput)
          this.activeInput.value = "=(B1*1.05)";
      }));
      menu.showAtMouseEvent(e);
    });
    createBtn("\u2261 L", () => this.onFormat("align", "left"));
    createBtn("\u2261 C", () => this.onFormat("align", "center"));
    createBtn("\u2261 R", () => this.onFormat("align", "right"));
  }
  show(input, cellId, td, row) {
    this.activeCellId = cellId;
    this.activeInput = input;
    this.el.style.display = "flex";
    const offset = row === 1 ? td.offsetHeight + 5 : -38;
    this.el.style.top = `${td.offsetTop + offset}px`;
    this.el.style.left = `${td.offsetLeft}px`;
  }
  hide() {
    this.el.style.display = "none";
    this.activeCellId = null;
    this.activeInput = null;
  }
};

// dataActions.ts
var insertRow = (tableData, targetRow, maxColCode, saveContent) => {
  const newData = { _format: tableData._format };
  const cols = Array.from({ length: maxColCode - 64 }, (_, i) => String.fromCharCode(65 + i));
  for (const [key, value] of Object.entries(tableData)) {
    if (key === "_format")
      continue;
    const match = key.match(/^([A-Z]+)(\d+)$/);
    if (!match)
      continue;
    const col = match[1];
    const row = parseInt(match[2], 10);
    if (row < targetRow)
      newData[key] = value;
    else
      newData[`${col}${row + 1}`] = value;
  }
  cols.forEach((c) => newData[`${c}${targetRow}`] = "");
  saveContent(newData);
};
var deleteRow = (tableData, targetRow, saveContent) => {
  const newData = { _format: tableData._format };
  for (const [key, value] of Object.entries(tableData)) {
    if (key === "_format")
      continue;
    const match = key.match(/^([A-Z]+)(\d+)$/);
    if (!match)
      continue;
    const col = match[1];
    const row = parseInt(match[2], 10);
    if (row < targetRow)
      newData[key] = value;
    else if (row > targetRow)
      newData[`${col}${row - 1}`] = value;
  }
  saveContent(newData);
};
var insertCol = (tableData, targetColCode, maxRow, maxColCode, saveContent) => {
  if (maxColCode >= 90)
    return;
  const newData = { _format: tableData._format };
  for (const [key, value] of Object.entries(tableData)) {
    if (key === "_format")
      continue;
    const match = key.match(/^([A-Z]+)(\d+)$/);
    if (!match)
      continue;
    const colCode = match[1].charCodeAt(0);
    const row = parseInt(match[2], 10);
    if (colCode < targetColCode)
      newData[key] = value;
    else
      newData[`${String.fromCharCode(colCode + 1)}${row}`] = value;
  }
  for (let r = 1; r <= maxRow; r++)
    newData[`${String.fromCharCode(targetColCode)}${r}`] = "";
  saveContent(newData);
};
var deleteCol = (tableData, targetColCode, saveContent) => {
  const newData = { _format: tableData._format };
  for (const [key, value] of Object.entries(tableData)) {
    if (key === "_format")
      continue;
    const match = key.match(/^([A-Z]+)(\d+)$/);
    if (!match)
      continue;
    const colCode = match[1].charCodeAt(0);
    const row = parseInt(match[2], 10);
    if (colCode < targetColCode)
      newData[key] = value;
    else if (colCode > targetColCode)
      newData[`${String.fromCharCode(colCode - 1)}${row}`] = value;
  }
  saveContent(newData);
};

// ui.ts
var nextFocusCell = null;
var renderTableUI = (el, tableData, settings, saveContent) => {
  if (!tableData._format)
    tableData._format = {};
  const cellIds = Object.keys(tableData).filter((k) => k !== "_format");
  let maxRow = 1;
  let maxColCode = 65;
  cellIds.forEach((id) => {
    const match = id.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      const row = parseInt(match[2], 10);
      if (row > maxRow)
        maxRow = row;
      if (match[1].charCodeAt(0) > maxColCode)
        maxColCode = match[1].charCodeAt(0);
    }
  });
  if (maxColCode < 66)
    maxColCode = 66;
  const cols = Array.from({ length: maxColCode - 64 }, (_, i) => String.fromCharCode(65 + i));
  const rows = maxRow;
  const wrapper = el.createEl("div", { attr: { style: "position: relative; padding-right: 28px; padding-bottom: 28px; margin: 10px 0;" } });
  const toolbar = settings.showToolbar ? new TableToolbar(wrapper, (key, val) => {
    const id = toolbar.activeCellId;
    if (!id || !toolbar.activeInput)
      return;
    if (!tableData._format[id])
      tableData._format[id] = {};
    tableData._format[id][key] = tableData._format[id][key] === val ? null : val;
    saveContent(tableData);
    if (key === "bold")
      toolbar.activeInput.style.fontWeight = tableData._format[id].bold ? "bold" : "normal";
    if (key === "align")
      toolbar.activeInput.style.textAlign = tableData._format[id].align || "left";
  }) : null;
  const container = wrapper.createEl("div", { attr: { style: "border: 1px solid var(--background-modifier-border-hover); border-radius: 6px; overflow: visible;" } });
  const table = container.createEl("table", { attr: { style: "width: 100%; border-collapse: collapse; margin: 0; table-layout: fixed;" } });
  if (settings.showHeaders) {
    const hr = table.createEl("tr");
    hr.createEl("th", { attr: { style: "width: 40px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border);" } });
    cols.forEach((c) => hr.createEl("th", { text: c, attr: { style: "background: var(--background-secondary); border: 1px solid var(--background-modifier-border); color: var(--text-muted); font-size: 11px; padding: 4px;" } }));
  }
  for (let r = 1; r <= rows; r++) {
    const tr = table.createEl("tr");
    if (settings.showHeaders) {
      tr.createEl("td", { text: r.toString(), attr: { style: "width: 40px; text-align: center; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); color: var(--text-muted); font-size: 11px;" } });
    }
    for (const c of cols) {
      const cellId = `${c}${r}`;
      const cellFormat = tableData._format[cellId] || {};
      const rawData = tableData[cellId] !== void 0 ? tableData[cellId] : "";
      let displayValue = rawData.toString();
      if (typeof rawData === "string" && rawData.startsWith("=")) {
        const num = evaluateMath(rawData, tableData);
        const isCurrency = cellFormat.type === "currency" || !cellFormat.type && settings.currencySymbol;
        displayValue = isCurrency ? `${settings.currencySymbol || "$"}${num.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : num.toString();
      } else if (typeof rawData === "number") {
        displayValue = rawData.toLocaleString("en-US", { minimumFractionDigits: 2 });
      }
      const td = tr.createEl("td", { attr: { style: "border: 1px solid var(--background-modifier-border); padding: 0; min-width: 120px;" } });
      const input = td.createEl("input", {
        type: "text",
        value: displayValue,
        attr: { "data-col": c, "data-row": r.toString(), style: `width: 100%; border: none; background: transparent; padding: 8px 12px; outline: none; text-align: ${cellFormat.align || "left"}; font-weight: ${cellFormat.bold ? "bold" : "normal"}; font-family: ${typeof rawData === "number" ? "monospace" : "inherit"};` }
      });
      if (typeof rawData === "string" && rawData.startsWith("=")) {
        input.style.color = "var(--text-accent)";
        tr.style.backgroundColor = "var(--background-secondary)";
      }
      if (nextFocusCell === cellId) {
        setTimeout(() => {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }, 20);
        nextFocusCell = null;
      }
      input.addEventListener("focus", () => {
        input.value = rawData.toString();
        input.style.background = "var(--background-modifier-active-hover)";
        toolbar == null ? void 0 : toolbar.show(input, cellId, td, r);
      });
      input.addEventListener("blur", () => {
        toolbar == null ? void 0 : toolbar.hide();
        input.style.background = "transparent";
        const newValue = input.value.trim();
        if (newValue !== rawData.toString()) {
          let parsedValue = newValue;
          if (newValue !== "" && !newValue.startsWith("=")) {
            const asNum = parseFloat(newValue.replace(/,/g, ""));
            if (!isNaN(asNum))
              parsedValue = asNum;
          }
          tableData[cellId] = parsedValue;
          saveContent(tableData);
        } else {
          input.value = displayValue;
        }
      });
      input.addEventListener("keydown", (e) => {
        let moveCol = c, moveRow = r;
        if (e.key === "Enter") {
          e.preventDefault();
          moveRow = e.shiftKey ? r - 1 : r + 1;
        } else if (e.key === "Tab") {
          const idx = cols.indexOf(c);
          if (!e.shiftKey) {
            if (idx < cols.length - 1)
              moveCol = cols[idx + 1];
            else if (r < rows) {
              moveCol = cols[0];
              moveRow = r + 1;
            }
          } else {
            if (idx > 0)
              moveCol = cols[idx - 1];
            else if (r > 1) {
              moveCol = cols[cols.length - 1];
              moveRow = r - 1;
            }
          }
        } else if (e.key === "ArrowDown")
          moveRow = r + 1;
        else if (e.key === "ArrowUp")
          moveRow = r - 1;
        else if (e.key === "ArrowRight" && input.selectionEnd === input.value.length) {
          const idx = cols.indexOf(c);
          if (idx < cols.length - 1)
            moveCol = cols[idx + 1];
        } else if (e.key === "ArrowLeft" && input.selectionStart === 0) {
          const idx = cols.indexOf(c);
          if (idx > 0)
            moveCol = cols[idx - 1];
        } else {
          return;
        }
        if (moveCol !== c || moveRow !== r) {
          e.preventDefault();
          nextFocusCell = `${moveCol}${moveRow}`;
          const target = table.querySelector(`input[data-col="${moveCol}"][data-row="${moveRow}"]`);
          if (target)
            target.focus();
          else
            input.blur();
        }
      });
      input.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const menu = new import_obsidian2.Menu();
        menu.addItem((i) => i.setTitle("Insert Row Above").setIcon("arrow-up").onClick(() => insertRow(tableData, r, maxColCode, saveContent)));
        menu.addItem((i) => i.setTitle("Insert Row Below").setIcon("arrow-down").onClick(() => insertRow(tableData, r + 1, maxColCode, saveContent)));
        menu.addItem((i) => i.setTitle("Delete Row").setIcon("trash").onClick(() => deleteRow(tableData, r, saveContent)));
        menu.addSeparator();
        menu.addItem((i) => i.setTitle("Insert Column Left").setIcon("arrow-left").onClick(() => insertCol(tableData, c.charCodeAt(0), rows, maxColCode, saveContent)));
        menu.addItem((i) => i.setTitle("Insert Column Right").setIcon("arrow-right").onClick(() => insertCol(tableData, c.charCodeAt(0) + 1, rows, maxColCode, saveContent)));
        menu.addItem((i) => i.setTitle("Delete Column").setIcon("trash").onClick(() => deleteCol(tableData, c.charCodeAt(0), saveContent)));
        menu.showAtMouseEvent(e);
      });
    }
  }
  if (settings == null ? void 0 : settings.enableHoverButtons) {
    const btnStyle = "position: absolute; display: flex; align-items: center; justify-content: center; background: var(--interactive-normal); border: 1px solid var(--background-modifier-border); border-radius: 4px; cursor: pointer; color: var(--text-muted); opacity: 0; transition: opacity 0.2s ease, background 0.2s ease; font-size: 16px; font-weight: bold;";
    const addColBtn = wrapper.createEl("button", { text: "+", attr: { style: `${btnStyle} right: 0; top: 0; bottom: 28px; width: 24px;` } });
    const addRowBtn = wrapper.createEl("button", { text: "+", attr: { style: `${btnStyle} bottom: 0; left: 0; right: 28px; height: 24px;` } });
    wrapper.addEventListener("mouseenter", () => {
      addColBtn.style.opacity = "1";
      addRowBtn.style.opacity = "1";
    });
    wrapper.addEventListener("mouseleave", () => {
      addColBtn.style.opacity = "0";
      addRowBtn.style.opacity = "0";
    });
    addColBtn.addEventListener("click", () => insertCol(tableData, maxColCode + 1, rows, maxColCode, saveContent));
    addRowBtn.addEventListener("click", () => insertRow(tableData, rows + 1, maxColCode, saveContent));
  }
};

// settings.ts
var import_obsidian3 = require("obsidian");
var DEFAULT_SETTINGS = {
  currencySymbol: "$",
  enableHoverButtons: true,
  showToolbar: true,
  showHeaders: true
};
var LiveFormulasSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Live Table Formulas Settings" });
    new import_obsidian3.Setting(containerEl).setName("Currency Symbol").addText((text) => text.setValue(this.plugin.settings.currencySymbol).onChange(async (value) => {
      this.plugin.settings.currencySymbol = value || "$";
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Enable Hover Buttons").addToggle((toggle) => toggle.setValue(this.plugin.settings.enableHoverButtons).onChange(async (value) => {
      this.plugin.settings.enableHoverButtons = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Show Formatting Toolbar").addToggle((toggle) => toggle.setValue(this.plugin.settings.showToolbar).onChange(async (value) => {
      this.plugin.settings.showToolbar = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Show Row/Column Headers").setDesc("Displays A, B, C and 1, 2, 3 labels.").addToggle((toggle) => toggle.setValue(this.plugin.settings.showHeaders).onChange(async (value) => {
      this.plugin.settings.showHeaders = value;
      await this.plugin.saveSettings();
    }));
  }
};

// main.ts
var LiveFormulasPlugin = class extends import_obsidian4.Plugin {
  async onload() {
    console.log("Loading Live Formulas Plugin (Settings Version)...");
    await this.loadSettings();
    this.addSettingTab(new LiveFormulasSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor(
      "live-table",
      (source, el, ctx) => {
        let tableData = {};
        try {
          tableData = source.trim() ? JSON.parse(source) : {};
        } catch (e) {
          el.createEl("div", { text: "Error reading table data.", attr: { style: "color: red;" } });
          return;
        }
        const saveContent = async (newData) => {
          const section = ctx.getSectionInfo(el);
          if (!section)
            return;
          const file = this.app.workspace.getActiveFile();
          if (!file)
            return;
          await this.app.vault.process(file, (data) => {
            const lines = data.split("\n");
            const newJson = JSON.stringify(newData, null, 2);
            lines.splice(section.lineStart + 1, section.lineEnd - section.lineStart - 1, newJson);
            return lines.join("\n");
          });
        };
        renderTableUI(el, tableData, this.settings, saveContent);
      }
    );
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  onunload() {
    console.log("Unloading Live Formulas Plugin...");
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {});
