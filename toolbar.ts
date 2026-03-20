import { Menu } from 'obsidian';

export class TableToolbar {
    el: HTMLElement;
    activeCellId: string | null = null;
    activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;

    constructor(parent: HTMLElement, private onFormat: (key: string, value: any) => void) {
        this.el = parent.createEl('div', {
            attr: { style: "position: absolute; display: none; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 4px; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.15); gap: 4px; align-items: center;" }
        });
        this.buildButtons();
    }

    private buildButtons() {
        const createBtn = (text: string, onClick: (e: MouseEvent) => void, bold = false) => {
            const btn = this.el.createEl('button', { 
                text, 
                attr: { style: `background: transparent; border: none; cursor: pointer; padding: 4px 8px; border-radius: 4px; color: var(--text-normal); font-size: 13px; ${bold ? 'font-weight: bold;' : ''}` } 
            });
            btn.addEventListener('mousedown', (e) => { e.preventDefault(); onClick(e); });
        };

        createBtn('B', () => this.onFormat('bold', true), true);
        createBtn('$', (e) => this.onFormat('type', 'currency'));

        createBtn('%', (e) => this.onFormat('type', 'percent'));
        createBtn('.00', (e) => this.onFormat('decimals', 'inc'));
        createBtn('.0', (e) => this.onFormat('decimals', 'dec'));

        createBtn('H±', (e) => this.onFormat('toggleHeaders', null));

        createBtn('fx', (e) => {
            const menu = new Menu();
            menu.addItem(i => i.setTitle('Sum Range').onClick(() => { if(this.activeInput) this.activeInput.value = '=SUM(B1:B5)'; }));
            menu.addItem(i => i.setTitle('Basic Multiply').onClick(() => { if(this.activeInput) this.activeInput.value = '=(B1*1.05)'; }));
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

        // Use viewport rects so position is correct with a formula bar (or any layout) above the table;
        // td.offsetTop/offsetLeft are relative to offsetParent (often the table), not the positioned wrapper.
        const pRect = parent.getBoundingClientRect();
        const tdRect = td.getBoundingClientRect();
        const topInParent = tdRect.top - pRect.top + parent.scrollTop;
        const leftInParent = tdRect.left - pRect.left + parent.scrollLeft;
        const gap = 6;
        void this.el.offsetHeight;
        const toolbarH = this.el.offsetHeight || 38;

        const placeBelow =
            row === 1 || topInParent < toolbarH + gap;

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