// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import { inject, injectable } from 'inversify';
import * as vscode from 'vscode';

import { IExtensionActivationService } from '../../activation/types';
import { IDocumentManager } from '../../common/application/types';
import { PYTHON_LANGUAGE } from '../../common/constants';
import { IConfigurationService, IDisposable, IDisposableRegistry, Resource } from '../../common/types';
import { generateCellRanges } from '../cellFactory';

@injectable()
export class Decorator implements IExtensionActivationService, IDisposable {

    private activeCellTop: vscode.TextEditorDecorationType | undefined;
    private activeCellBottom: vscode.TextEditorDecorationType | undefined;
    private cellSeparatorType: vscode.TextEditorDecorationType | undefined;
    private timer: NodeJS.Timer | undefined;

    constructor(@inject(IDocumentManager) private documentManager: IDocumentManager,
                @inject(IDisposableRegistry) disposables: IDisposableRegistry,
                @inject(IConfigurationService) private configuration: IConfigurationService)
    {
        this.computeDecorations();
        disposables.push(this);
        disposables.push(this.configuration.getSettings().onDidChange(this.settingsChanged, this));
        disposables.push(this.documentManager.onDidChangeActiveTextEditor(this.changedEditor, this));
        disposables.push(this.documentManager.onDidChangeTextEditorSelection(this.changedSelection, this));
        disposables.push(this.documentManager.onDidChangeTextDocument(this.changedDocument, this));
        this.settingsChanged();
    }

    public activate(_resource: Resource) : Promise<void> {
        // We don't need to do anything here as we already did all of our work in the
        // constructor.
        return Promise.resolve();
    }

    public dispose() {
        if (this.timer) {
            clearTimeout(this.timer);
        }
    }

    private settingsChanged() {
        if (this.documentManager.activeTextEditor) {
            this.triggerUpdate(this.documentManager.activeTextEditor);
        }
    }

    private changedEditor(editor: vscode.TextEditor | undefined) {
        this.triggerUpdate(editor);
    }

    private changedDocument(e: vscode.TextDocumentChangeEvent) {
        if (this.documentManager.activeTextEditor && e.document === this.documentManager.activeTextEditor.document) {
            this.triggerUpdate(this.documentManager.activeTextEditor);
        }
    }

    private changedSelection(e: vscode.TextEditorSelectionChangeEvent) {
        if (e.textEditor && e.textEditor.selection.anchor) {
            this.triggerUpdate(e.textEditor);
        }
    }

    private triggerUpdate(editor: vscode.TextEditor | undefined) {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => this.update(editor), 100);
    }

    private computeDecorations() {
        this.activeCellTop = this.documentManager.createTextEditorDecorationType({
            borderColor: new vscode.ThemeColor('peekView.border'),
            borderWidth: '2px 0px 0px 0px',
            borderStyle: 'solid',
            isWholeLine: true
        });
        this.activeCellBottom = this.documentManager.createTextEditorDecorationType({
            borderColor: new vscode.ThemeColor('peekView.border'),
            borderWidth: '0px 0px 1px 0px',
            borderStyle: 'solid',
            isWholeLine: true
        });
        this.cellSeparatorType = this.documentManager.createTextEditorDecorationType({
            borderColor: new vscode.ThemeColor('editor.lineHighlightBorder'),
            borderWidth: '1px 0px 0px 0px',
            borderStyle: 'solid',
            isWholeLine: true
        });
    }

    private update(editor: vscode.TextEditor | undefined) {
        if (editor && editor.document && editor.document.languageId === PYTHON_LANGUAGE &&
            this.activeCellTop && this.cellSeparatorType && this.activeCellBottom) {
            const settings = this.configuration.getSettings().datascience;
            if (settings.decorateCells && settings.enabled) {
                // Find all of the cells
                const cells = generateCellRanges(editor.document, this.configuration.getSettings().datascience);

                // Find the range for our active cell.
                const currentRange = cells.map(c => c.range).filter(r => r.contains(editor.selection.anchor));
                const rangeTop = currentRange.length > 0 ? [new vscode.Range(currentRange[0].start, currentRange[0].start)] : [];
                const rangeBottom = currentRange.length > 0 ? [new vscode.Range(currentRange[0].end, currentRange[0].end)] : [];
                editor.setDecorations(this.activeCellTop, rangeTop);
                editor.setDecorations(this.activeCellBottom, rangeBottom);

                // Find the start range for the rest
                const startRanges = cells.map(c => new vscode.Range(c.range.start, c.range.start));
                editor.setDecorations(this.cellSeparatorType, startRanges);
            } else {
                editor.setDecorations(this.activeCellTop, []);
                editor.setDecorations(this.activeCellBottom, []);
                editor.setDecorations(this.cellSeparatorType, []);
            }
        }
    }
}
