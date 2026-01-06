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
  default: () => SearchPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  openCounts: {},
  searchDirs: []
};
var SearchPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "search",
      name: "Search",
      callback: () => new SearchModal(this.app, this).open()
    });
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file) {
          this.settings.openCounts[file.path] = (this.settings.openCounts[file.path] || 0) + 1;
          this.saveSettings();
        }
      })
    );
    this.addSettingTab(new SearchSettingTab(this.app, this));
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var SearchSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Search directories").setDesc("Comma-separated directory paths. Empty for all directories.").addText((text) => text.setPlaceholder("docs,notes").setValue(this.plugin.settings.searchDirs.join(",")).onChange(async (value) => {
      this.plugin.settings.searchDirs = value.split(",").map((s) => s.trim()).filter((s) => s);
      await this.plugin.saveSettings();
    }));
  }
};
var SearchModal = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.items = [];
    this.plugin = plugin;
  }
  async onOpen() {
    let files = this.app.vault.getMarkdownFiles();
    if (this.plugin.settings.searchDirs.length > 0) {
      files = files.filter(
        (file) => this.plugin.settings.searchDirs.some((dir) => file.path.startsWith(dir))
      );
    }
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const count = this.plugin.settings.openCounts[file.path] || 0;
      this.items.push({ file, snippet: content, score: count * 10 });
    }
    this.items.sort((a, b) => b.score - a.score);
  }
  getItems() {
    return this.items;
  }
  getItemText(result) {
    return result.file.basename + " " + result.snippet;
  }
  renderSuggestion(match, el) {
    const result = match.item;
    const titleEl = el.createDiv({ cls: "suggestion-title" });
    const titleText = result.file.basename;
    if (match.match.matches) {
      let lastIndex = 0;
      const titleSpan = titleEl.createSpan();
      match.match.matches.forEach((m) => {
        if (m[0] < titleText.length) {
          titleSpan.appendText(titleText.substring(lastIndex, m[0]));
          titleSpan.createSpan({ text: titleText.substring(m[0], m[1]), cls: "suggestion-highlight" });
          lastIndex = m[1];
        }
      });
      titleSpan.appendText(titleText.substring(lastIndex));
    } else {
      titleEl.createSpan({ text: titleText });
    }
    const pathEl = el.createDiv({ cls: "suggestion-note" });
    const pathIconEl = pathEl.createSpan();
    (0, import_obsidian.setIcon)(pathIconEl, "folder");
    pathEl.createSpan({ text: " " + (result.file.parent?.path || "") });
    pathEl.style.opacity = "0.5";
    pathEl.style.fontSize = "0.85em";
    const contentMatchStart = match.match.matches?.find((m) => m[0] >= titleText.length + 1);
    if (contentMatchStart) {
      const snippetOffset = contentMatchStart[0] - titleText.length - 1;
      const contextStart = Math.max(0, snippetOffset - 50);
      const contextEnd = Math.min(result.snippet.length, snippetOffset + 150);
      const snippet = result.snippet.substring(contextStart, contextEnd);
      const contentEl = el.createDiv({ cls: "suggestion-content" });
      const adjustedMatches = match.match.matches.filter((m) => m[0] >= titleText.length + 1).map((m) => [m[0] - titleText.length - 1 - contextStart, m[1] - titleText.length - 1 - contextStart]).filter((m) => m[0] >= 0 && m[0] < snippet.length);
      let lastIndex = 0;
      adjustedMatches.forEach((m) => {
        contentEl.appendText(snippet.substring(lastIndex, m[0]));
        contentEl.createSpan({ text: snippet.substring(m[0], m[1]), cls: "suggestion-highlight" });
        lastIndex = m[1];
      });
      contentEl.appendText(snippet.substring(lastIndex));
      contentEl.style.opacity = "0.5";
      contentEl.style.fontSize = "0.9em";
    }
  }
  onChooseItem(result) {
    this.app.workspace.getLeaf().openFile(result.file);
  }
};
