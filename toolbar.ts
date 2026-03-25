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
        this.el = parent.createEl('div', { cls: 'live-formula-toolbar' });
        this.buildButtons();
    }

    private buildButtons() {
        const createBtn = (text: string, onClick: (e: MouseEvent) => void, opts?: { bold?: boolean }) => {
            const cls = ['live-formula-toolbar-btn'];
            if (opts?.bold) cls.push('live-formula-toolbar-btn--bold');
            const btn = this.el.createEl('button', { text, cls: cls.join(' ') });
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                onClick(e);
            });
        };

        createBtn('B', () => this.onFormat('bold', true), { bold: true });
        createBtn('$', () => this.onFormat('type', 'currency'));
        createBtn('%', () => this.onFormat('type', 'percent'));
        createBtn('.00', () => this.onFormat('decimals', 'inc'));
        createBtn('.0', () => this.onFormat('decimals', 'dec'));
        createBtn('H±', () => this.onFormat('toggleHeaders', null));
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
        createBtn('≡ L', () => this.onFormat('align', 'left'));
        createBtn('≡ C', () => this.onFormat('align', 'center'));
        createBtn('≡ R', () => this.onFormat('align', 'right'));
    }

    show(input: HTMLInputElement | HTMLTextAreaElement, cellId: string, td: HTMLElement, row: number) {
        this.activeCellId = cellId;
        this.activeInput = input;
        this.el.style.display = 'flex';

        const parent = this.el.parentElement;
        if (!parent) return;

        const pRect = parent.getBoundingClientRect();
        const tdRect = td.getBoundingClientRect();
        const topInParent = tdRect.top - pRect.top + parent.scrollTop;
        const leftInParent = tdRect.left - pRect.left + parent.scrollLeft;
        const gap = 6;
        void this.el.offsetHeight;
        const toolbarH = this.el.offsetHeight || 38;

        const placeBelow = row === 1 || topInParent < toolbarH + gap;

        if (placeBelow) {
            this.el.style.top = `${topInParent + tdRect.height + gap}px`;
        } else {
            this.el.style.top = `${topInParent - toolbarH - gap}px`;
        }
        this.el.style.left = `${leftInParent}px`;
    }

    hide() {
        this.el.style.display = 'none';
        this.activeCellId = null;
        this.activeInput = null;
    }
}
