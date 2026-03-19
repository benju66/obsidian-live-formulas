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
var import_obsidian3 = require("obsidian");

// ui.ts
var import_obsidian = require("obsidian");

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

// ui.ts
var nextFocusCell = null;
var renderTableUI = (el, tableData, settings, saveContent) => {
  const cellIds = Object.keys(tableData);
  let maxRow = 1;
  let maxColCode = 65;
  cellIds.forEach((id) => {
    const match = id.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      const col = match[1];
      const row = parseInt(match[2], 10);
      if (row > maxRow)
        maxRow = row;
      if (col.charCodeAt(0) > maxColCode)
        maxColCode = col.charCodeAt(0);
    }
  });
  if (maxColCode < 66)
    maxColCode = 66;
  const cols = [];
  for (let i = 65; i <= maxColCode; i++) {
    cols.push(String.fromCharCode(i));
  }
  const rows = maxRow;
  const insertRow = (targetRow) => {
    const newData = {};
    for (const [key, value] of Object.entries(tableData)) {
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
    for (let i = 65; i <= maxColCode; i++)
      newData[`${String.fromCharCode(i)}${targetRow}`] = "";
    saveContent(newData);
  };
  const deleteRow = (targetRow) => {
    const newData = {};
    for (const [key, value] of Object.entries(tableData)) {
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
  const insertCol = (targetColCode) => {
    if (maxColCode >= 90)
      return;
    const newData = {};
    for (const [key, value] of Object.entries(tableData)) {
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
  const deleteCol = (targetColCode) => {
    const newData = {};
    for (const [key, value] of Object.entries(tableData)) {
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
  const wrapper = el.createEl("div", {
    attr: { style: "position: relative; padding-right: 28px; padding-bottom: 28px; margin-top: 10px; margin-bottom: 10px;" }
  });
  const container = wrapper.createEl("div", {
    attr: { style: "border: 1px solid var(--background-modifier-border-hover); border-radius: 6px; overflow: hidden;" }
  });
  const table = container.createEl("table", {
    attr: { style: "width: 100%; border-collapse: collapse; margin: 0;" }
  });
  for (let r = 1; r <= rows; r++) {
    const tr = table.createEl("tr");
    for (const c of cols) {
      const cellId = `${c}${r}`;
      const rawData = tableData[cellId] !== void 0 ? tableData[cellId] : "";
      let displayValue = rawData.toString();
      if (typeof rawData === "string" && rawData.startsWith("=")) {
        const calculatedNumber = evaluateMath(rawData, tableData);
        displayValue = `$${calculatedNumber.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else if (typeof rawData === "number") {
        displayValue = rawData.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      const td = tr.createEl("td", {
        attr: { style: "border: 1px solid var(--background-modifier-border); padding: 0; min-width: 120px;" }
      });
      const input = td.createEl("input", {
        type: "text",
        value: displayValue,
        attr: {
          "data-col": c,
          "data-row": r.toString(),
          style: "width: 100%; box-sizing: border-box; border: none; background: transparent; color: inherit; font-family: inherit; font-size: inherit; padding: 8px 12px; outline: none;"
        }
      });
      if (typeof rawData === "string" && rawData.startsWith("=")) {
        input.style.fontWeight = "bold";
        input.style.color = "var(--text-accent)";
        tr.style.backgroundColor = "var(--background-secondary)";
      }
      if (!isNaN(parseFloat(displayValue.replace(/,/g, "").replace("$", "")))) {
        input.style.textAlign = "right";
        input.style.fontFamily = "monospace";
      }
      if (nextFocusCell === cellId) {
        let attempts = 0;
        const tryFocus = () => {
          if (document.body.contains(input)) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          } else if (attempts < 20) {
            attempts++;
            setTimeout(tryFocus, 10);
          }
        };
        setTimeout(tryFocus, 10);
        nextFocusCell = null;
      }
      input.addEventListener("focus", () => {
        input.value = rawData.toString();
        input.style.background = "var(--background-modifier-active-hover)";
      });
      input.addEventListener("blur", () => {
        input.style.background = "transparent";
        const newValue = input.value.trim();
        if (newValue === rawData.toString()) {
          input.value = displayValue;
          return;
        }
        let parsedValue = newValue;
        if (newValue !== "" && !newValue.startsWith("=")) {
          const asNumber = parseFloat(newValue.replace(/,/g, ""));
          if (!isNaN(asNumber))
            parsedValue = asNumber;
        }
        tableData[cellId] = parsedValue;
        saveContent(tableData);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const nextRow = e.shiftKey ? r - 1 : r + 1;
          if (nextRow >= 1 && nextRow <= rows) {
            nextFocusCell = `${c}${nextRow}`;
            const nextInput = table.querySelector(`input[data-col="${c}"][data-row="${nextRow}"]`);
            if (nextInput) {
              nextInput.focus();
            } else {
              input.blur();
            }
          } else {
            input.blur();
          }
        }
        if (e.key === "Tab") {
          const colIndex = cols.indexOf(c);
          let nextCol = c;
          let nextRow = r;
          if (!e.shiftKey) {
            if (colIndex < cols.length - 1)
              nextCol = cols[colIndex + 1];
            else if (r < rows) {
              nextCol = cols[0];
              nextRow = r + 1;
            }
          } else {
            if (colIndex > 0)
              nextCol = cols[colIndex - 1];
            else if (r > 1) {
              nextCol = cols[cols.length - 1];
              nextRow = r - 1;
            }
          }
          nextFocusCell = `${nextCol}${nextRow}`;
        }
      });
      input.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const menu = new import_obsidian.Menu();
        menu.addItem((item) => {
          item.setTitle("Insert Row Above").setIcon("arrow-up").onClick(() => insertRow(r));
        });
        menu.addItem((item) => {
          item.setTitle("Insert Row Below").setIcon("arrow-down").onClick(() => insertRow(r + 1));
        });
        menu.addItem((item) => {
          item.setTitle("Delete Row").setIcon("trash").onClick(() => deleteRow(r));
        });
        menu.addSeparator();
        menu.addItem((item) => {
          item.setTitle("Insert Column Left").setIcon("arrow-left").onClick(() => insertCol(c.charCodeAt(0)));
        });
        menu.addItem((item) => {
          item.setTitle("Insert Column Right").setIcon("arrow-right").onClick(() => insertCol(c.charCodeAt(0) + 1));
        });
        menu.addItem((item) => {
          item.setTitle("Delete Column").setIcon("trash").onClick(() => deleteCol(c.charCodeAt(0)));
        });
        menu.showAtMouseEvent(e);
      });
    }
  }
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
  addColBtn.addEventListener("mouseenter", () => addColBtn.style.background = "var(--interactive-hover)");
  addColBtn.addEventListener("mouseleave", () => addColBtn.style.background = "var(--interactive-normal)");
  addRowBtn.addEventListener("mouseenter", () => addRowBtn.style.background = "var(--interactive-hover)");
  addRowBtn.addEventListener("mouseleave", () => addRowBtn.style.background = "var(--interactive-normal)");
  addColBtn.addEventListener("click", () => {
    if (maxColCode >= 90)
      return;
    const newColChar = String.fromCharCode(maxColCode + 1);
    for (let r = 1; r <= rows; r++)
      tableData[`${newColChar}${r}`] = "";
    saveContent(tableData);
  });
  addRowBtn.addEventListener("click", () => {
    const newRow = rows + 1;
    cols.forEach((c) => {
      tableData[`${c}${newRow}`] = "";
    });
    saveContent(tableData);
  });
};

// settings.ts
var import_obsidian2 = require("obsidian");
var DEFAULT_SETTINGS = {
  currencySymbol: "$",
  enableHoverButtons: true
};
var LiveFormulasSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Live Table Formulas Settings" });
    new import_obsidian2.Setting(containerEl).setName("Currency Symbol").setDesc("Which symbol should be used when formatting formula outputs?").addText((text) => text.setPlaceholder("e.g. $ or \u20AC").setValue(this.plugin.settings.currencySymbol).onChange(async (value) => {
      this.plugin.settings.currencySymbol = value || "$";
      await this.plugin.saveSettings();
    }));
    new import_obsidian2.Setting(containerEl).setName("Enable Hover Buttons").setDesc("Show the floating + buttons to easily add rows and columns.").addToggle((toggle) => toggle.setValue(this.plugin.settings.enableHoverButtons).onChange(async (value) => {
      this.plugin.settings.enableHoverButtons = value;
      await this.plugin.saveSettings();
    }));
  }
};

// main.ts
var LiveFormulasPlugin = class extends import_obsidian3.Plugin {
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
