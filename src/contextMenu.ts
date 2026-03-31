import { Menu } from 'obsidian';
import { TableState, lettersToColumnIndex } from '../tableState';
import * as Actions from '../dataActions';
import type { SelectionManager } from './selectionManager';
import type { ClipboardHandlers } from './clipboardManager';

export interface TableMenuServices {
    state: TableState;
    selectionManager: SelectionManager;
    wrapper: HTMLElement;
    saveWithHistory: () => void;
    rerender: () => void;
    rowCount: number;
    clipboard: ClipboardHandlers;
}

/** Copy / Cut / Paste + separator — shared by column, row, and cell header menus. */
export function addClipboardMenuSection(menu: Menu, clipboard: ClipboardHandlers): void {
    menu.addItem((i) => i.setTitle('Copy').onClick(() => clipboard.executeCopy()));
    menu.addItem((i) => i.setTitle('Cut').onClick(() => clipboard.executeCut()));
    menu.addItem((i) =>
        i.setTitle('Paste').onClick(async () => {
            const text = await navigator.clipboard.readText();
            if (text) clipboard.executePaste(text);
        })
    );
    menu.addSeparator();
}

export function openColumnHeaderContextMenu(e: MouseEvent, colLetter: string, svc: TableMenuServices): void {
    e.preventDefault();
    const { selectionManager, wrapper, state, saveWithHistory, rerender, rowCount, clipboard } = svc;

    const selectedCols = new Set(selectionManager.getSelectedIds().map((id) => id.match(/[A-Z]+/)?.[0]));
    if (!selectedCols.has(colLetter)) {
        selectionManager.selectColumn(colLetter);
    }
    wrapper.focus({ preventScroll: true });
    const colIdx = lettersToColumnIndex(colLetter);
    const menu = new Menu();

    addClipboardMenuSection(menu, clipboard);

    const colsToDelete = Array.from(
        new Set(selectionManager.getSelectedIds().map((id) => lettersToColumnIndex(id.match(/[A-Z]+/)?.[0] || 'A')))
    )
        .filter((n) => n > 0)
        .sort((a, b) => b - a);

    const deleteLabel = colsToDelete.length > 1 ? `Delete ${colsToDelete.length} Columns` : 'Delete Column';

    menu.addItem((i) =>
        i.setTitle('Insert Column Left').onClick(() => {
            Actions.insertCol(state, colIdx, rowCount);
            saveWithHistory();
            rerender();
        })
    );
    menu.addItem((i) =>
        i.setTitle('Insert Column Right').onClick(() => {
            Actions.insertCol(state, colIdx + 1, rowCount);
            saveWithHistory();
            rerender();
        })
    );
    menu.addItem((i) =>
        i.setTitle(deleteLabel).onClick(() => {
            colsToDelete.forEach((cIdx) => Actions.deleteCol(state, cIdx));
            saveWithHistory();
            rerender();
        })
    );
    menu.showAtMouseEvent(e);
}

export function openRowHeaderContextMenu(e: MouseEvent, rowIndex: number, svc: TableMenuServices): void {
    e.preventDefault();
    const { selectionManager, wrapper, state, saveWithHistory, rerender, clipboard } = svc;

    const selectedRows = new Set(selectionManager.getSelectedIds().map((id) => id.match(/\d+/)?.[0]));
    if (!selectedRows.has(rowIndex.toString())) {
        selectionManager.selectRow(rowIndex);
    }
    wrapper.focus({ preventScroll: true });
    const menu = new Menu();

    addClipboardMenuSection(menu, clipboard);

    const rowsToDelete = Array.from(
        new Set(selectionManager.getSelectedIds().map((id) => parseInt(id.match(/\d+/)?.[0] || '0', 10)))
    )
        .filter((n) => n > 0)
        .sort((a, b) => b - a);

    const deleteLabel = rowsToDelete.length > 1 ? `Delete ${rowsToDelete.length} Rows` : 'Delete Row';

    menu.addItem((i) =>
        i.setTitle('Insert Row Above').onClick(() => {
            Actions.insertRow(state, rowIndex);
            saveWithHistory();
            rerender();
        })
    );
    menu.addItem((i) =>
        i.setTitle('Insert Row Below').onClick(() => {
            Actions.insertRow(state, rowIndex + 1);
            saveWithHistory();
            rerender();
        })
    );
    menu.addItem((i) =>
        i.setTitle(deleteLabel).onClick(() => {
            rowsToDelete.forEach((rIdx) => Actions.deleteRow(state, rIdx));
            saveWithHistory();
            rerender();
        })
    );
    menu.showAtMouseEvent(e);
}

export function openCellContextMenu(
    e: MouseEvent,
    cellId: string,
    rowIndex: number,
    colIdx: number,
    svc: TableMenuServices
): void {
    e.preventDefault();
    const { selectionManager, wrapper, state, saveWithHistory, rerender, rowCount, clipboard } = svc;

    selectionManager.restoreSelection(cellId, [cellId]);
    wrapper.focus({ preventScroll: true });
    const menu = new Menu();

    addClipboardMenuSection(menu, clipboard);

    menu.addItem((i) =>
        i.setTitle('Insert Row Above').onClick(() => {
            Actions.insertRow(state, rowIndex);
            saveWithHistory();
            rerender();
        })
    );
    menu.addItem((i) =>
        i.setTitle('Insert Row Below').onClick(() => {
            Actions.insertRow(state, rowIndex + 1);
            saveWithHistory();
            rerender();
        })
    );
    menu.addItem((i) =>
        i.setTitle('Delete Row').onClick(() => {
            Actions.deleteRow(state, rowIndex);
            saveWithHistory();
            rerender();
        })
    );
    menu.addSeparator();
    menu.addItem((i) =>
        i.setTitle('Insert Column Left').onClick(() => {
            Actions.insertCol(state, colIdx, rowCount);
            saveWithHistory();
            rerender();
        })
    );
    menu.addItem((i) =>
        i.setTitle('Insert Column Right').onClick(() => {
            Actions.insertCol(state, colIdx + 1, rowCount);
            saveWithHistory();
            rerender();
        })
    );
    menu.addItem((i) =>
        i.setTitle('Delete Column').onClick(() => {
            Actions.deleteCol(state, colIdx);
            saveWithHistory();
            rerender();
        })
    );

    menu.showAtMouseEvent(e);
}
