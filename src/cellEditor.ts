import { TableState } from '../tableState';
import { MathEngine } from '../math';

export class CellEditor {
    public el: HTMLTextAreaElement;

    constructor(private wrapper: HTMLElement, private state: TableState, private engine: MathEngine) {
        // We will build the floating textarea here in Step 2
        this.el = document.createElement('textarea');
        this.el.className = 'live-formula-floating-editor';
        this.el.style.display = 'none';
        this.wrapper.appendChild(this.el);
    }

    public destroy() {
        this.el.remove();
    }
}
