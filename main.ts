import { Plugin, TFile, FuzzySuggestModal, FuzzyMatch, SearchResult, prepareFuzzySearch, setIcon, PluginSettingTab, App, Setting } from 'obsidian';

interface PluginSettings {
  searchDirs: string[];
}

const DEFAULT_SETTINGS: PluginSettings = {
  searchDirs: []
};

export default class SearchPlugin extends Plugin {
  settings: PluginSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'search',
      name: 'Search',
      callback: () => new SearchModal(this.app, this).open()
    });

    this.addSettingTab(new SearchSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SearchSettingTab extends PluginSettingTab {
  plugin: SearchPlugin;

  constructor(app: App, plugin: SearchPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Search directories')
      .setDesc('Comma-separated directory paths. Empty for all directories.')
      .addText(text => text
        .setPlaceholder('docs,notes')
        .setValue(this.plugin.settings.searchDirs.join(','))
        .onChange(async (value) => {
          this.plugin.settings.searchDirs = value
            .split(',')
            .map(s => s.trim())
            .filter(s => s);
          await this.plugin.saveSettings();
        }));
  }
}

interface SearchItem {
  file: TFile;
  snippet: string;
}

class SearchModal extends FuzzySuggestModal<SearchItem> {
  items: SearchItem[] = [];
  plugin: SearchPlugin;
  queryText = '';

  constructor(app: any, plugin: SearchPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    let files = this.app.vault.getMarkdownFiles();

    if (this.plugin.settings.searchDirs.length > 0) {
      files = files.filter(file =>
        this.plugin.settings.searchDirs.some(dir => file.path.startsWith(dir))
      );
    }

    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      this.items.push({ file, snippet: content });
    }
  }

  getItems(): SearchItem[] {
    return this.items;
  }

  getItemText(result: SearchItem): string {
    return result.file.basename + ' ' + result.snippet;
  }

  getSuggestions(query: string): FuzzyMatch<SearchItem>[] {
    this.queryText = query;
    if (!query) {
      return this.items.map(item => ({ item, match: { score: 0, matches: [] } }));
    }
    const q = query.toLowerCase();
    const fuzzy = prepareFuzzySearch(query);
    const entries: {
      item: SearchItem;
      rank: number;
      offset: number;
      index: number;
      fuzzyMatch: SearchResult | null;
    }[] = [];
    this.items.forEach((item, index) => {
      const nameMatch = item.file.basename.toLowerCase().includes(q);
      const contentMatchIndex = item.snippet.toLowerCase().indexOf(q);
      const contentMatch = contentMatchIndex !== -1;
      const nameFuzzy = nameMatch ? null : fuzzy(item.file.basename);
      const contentFuzzy = contentMatch ? null : fuzzy(item.snippet);
      if (!nameMatch && !contentMatch && !nameFuzzy && !contentFuzzy) {
        return;
      }
      let rank = 0;
      let offset = Infinity;
      let fuzzyMatch: SearchResult | null = null;
      if (nameMatch) {
        rank = 0;
      } else if (contentMatch) {
        rank = 1;
        const lineStart = item.snippet.lastIndexOf('\n', contentMatchIndex - 1) + 1;
        offset = contentMatchIndex - lineStart;
      } else if (nameFuzzy) {
        rank = 2;
        fuzzyMatch = nameFuzzy;
      } else {
        rank = 3;
        fuzzyMatch = contentFuzzy;
      }
      entries.push({ item, rank, offset, index, fuzzyMatch });
    });
    // 検索結果の優先順位要件：
    // 1. ファイル名の部分一致
    // 2. 本文の部分一致（offsetが小さい＝先頭に近いもの）
    // 3. fuzzy一致（ファイル名）
    // 4. fuzzy一致（本文）
    entries.sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      if (a.rank === 1) {
        return a.offset - b.offset;
      }
      if (a.rank >= 2) {
        const aScore = a.fuzzyMatch ? a.fuzzyMatch.score : 0;
        const bScore = b.fuzzyMatch ? b.fuzzyMatch.score : 0;
        return bScore - aScore;
      }
      return a.index - b.index;
    });
    return entries.map(entry => ({
      item: entry.item,
      match: entry.fuzzyMatch ?? { score: 0, matches: [] }
    }));
  }

  findMatches(text: string, query: string): [number, number][] {
    if (!query) {
      return [];
    }
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    const matches: [number, number][] = [];
    let index = 0;
    while (true) {
      index = t.indexOf(q, index);
      if (index === -1) {
        break;
      }
      matches.push([index, index + q.length]);
      index += q.length;
    }
    return matches;
  }

  appendHighlightedText(el: HTMLElement, text: string, matches: [number, number][]) {
    if (matches.length === 0) {
      el.appendText(text);
      return;
    }
    let lastIndex = 0;
    matches.forEach(m => {
      el.appendText(text.substring(lastIndex, m[0]));
      el.createSpan({ text: text.substring(m[0], m[1]), cls: 'suggestion-highlight' });
      lastIndex = m[1];
    });
    el.appendText(text.substring(lastIndex));
  }

  renderSuggestion(match: FuzzyMatch<SearchItem>, el: HTMLElement) {
    const result = match.item;
    const titleEl = el.createDiv({ cls: 'suggestion-title' });

    const titleText = result.file.basename;
    const titleSpan = titleEl.createSpan();
    const titleMatches = this.findMatches(titleText, this.queryText);
    this.appendHighlightedText(titleSpan, titleText, titleMatches);

    const pathEl = el.createDiv({ cls: 'suggestion-note' });
    const pathIconEl = pathEl.createSpan();
    setIcon(pathIconEl, 'folder');
    pathEl.createSpan({ text: ' ' + (result.file.parent?.path || '') });
    pathEl.style.opacity = '0.5';
    pathEl.style.fontSize = '0.85em';

    const contentMatches = this.findMatches(result.snippet, this.queryText);
    const contentEl = el.createDiv({ cls: 'suggestion-content' });
    if (contentMatches.length > 0) {
      const snippetOffset = contentMatches[0][0];
      const contextStart = Math.max(0, snippetOffset - 50);
      const contextEnd = Math.min(result.snippet.length, snippetOffset + 150);
      const snippet = result.snippet.substring(contextStart, contextEnd);

      const adjustedMatches = contentMatches
        .map(m => [m[0] - contextStart, m[1] - contextStart] as [number, number])
        .filter(m => m[0] >= 0 && m[0] < snippet.length);
      this.appendHighlightedText(contentEl, snippet, adjustedMatches);
    } else {
      const snippet = result.snippet.substring(0, 150);
      contentEl.appendText(snippet);
    }
    contentEl.style.opacity = '0.5';
    contentEl.style.fontSize = '0.9em';
  }

  onChooseItem(item: SearchItem) {
    this.app.workspace.getLeaf().openFile(item.file);
  }
}
