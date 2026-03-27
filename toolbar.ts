import { Menu } from 'obsidian';

/**
 * Format actions invoke `onFormat`; the host (ui.ts) applies them to the active cell
 * or to every id in `selectedCellIds` when bulk Ctrl/Cmd selection is active.
 */
export class TableToolbar {
    el: HTMLElement;
    activeCellId: string | null = null;
    activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;

    constructor(parent: HTMLElement, private onFormat: (key: string, value: any) => void) {
        this.el = parent.createEl('div', { cls: 'live-formula-toolbar-ribbon' });
        this.buildButtons();
    }

    private buildButtons() {
        const createBtn = (text: string, onClick: (e: MouseEvent) => void, opts?: { bold?: boolean; title?: string }) => {
            const cls = ['live-formula-toolbar-btn'];
            if (opts?.bold) cls.push('live-formula-toolbar-btn--bold');
            const btn = this.el.createEl('button', { text, cls: cls.join(' ') });
            if (opts?.title) btn.title = opts.title;

            // FIX: Fire on mousedown and stop propagation to prevent the selection from clearing
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick(e);
            });
        };

        createBtn('↶', () => this.onFormat('history', 'undo'), { title: 'Undo' });
        createBtn('↷', () => this.onFormat('history', 'redo'), { title: 'Redo' });
        this.el.createEl('div', { cls: 'live-formula-toolbar-divider' });

        createBtn('B', () => this.onFormat('bold', true), { bold: true });
        createBtn('$', () => this.onFormat('type', 'currency'));
        createBtn('%', () => this.onFormat('type', 'percent'));
        createBtn('.00', () => this.onFormat('decimals', 'inc'));
        createBtn('.0', () => this.onFormat('decimals', 'dec'));

        this.el.createEl('div', { cls: 'live-formula-toolbar-divider' });

        createBtn('≡ L', () => this.onFormat('align', 'left'));
        createBtn('≡ C', () => this.onFormat('align', 'center'));
        createBtn('≡ R', () => this.onFormat('align', 'right'));

        this.el.createEl('div', { cls: 'live-formula-toolbar-divider' });

        createBtn('fx', (e) => {
            const menu = new Menu();
            menu.addItem((i) =>
                i.setTitle('Sum Range').onClick(() => {
                    if (this.activeInput) this.activeInput.value = '=SUM(B1:B5)';
                })
            );
            menu.addItem((i) =>
                i.setTitle('Basic Multiply').onClick(() => {
                    if (this.activeInput) this.activeInput.value = '=(B1*1.05)';
                })
            );
            menu.showAtMouseEvent(e);
        });
        createBtn('H±', () => this.onFormat('toggleHeaders', null));
    }

    /** Tracks which cell formatting applies to; ribbon stays visible. */
    setActiveCell(input: HTMLInputElement | HTMLTextAreaElement | null, cellId: string | null) {
        this.activeCellId = cellId;
        this.activeInput = input;
    }
}
