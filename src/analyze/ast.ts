import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { FileMetrics } from '../model/metrics.js';

function countLoc(sourceText: string): number {
  return sourceText.split('\n').filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('//');
  }).length;
}

function lineSpan(sourceFile: ts.SourceFile, node: ts.Node): number {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
  return Math.max(1, end - start + 1);
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  );
}

function isControlFlowNode(node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  );
}

function isAnyKeyword(node: ts.Node): boolean {
  return node.kind === ts.SyntaxKind.AnyKeyword;
}

function visit(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  metrics: {
    functionLengths: number[];
    functionCount: number;
    maxNestingDepth: number;
    controlFlowCount: number;
    typeEscapeCount: number;
  },
  currentNesting: number,
): void {
  if (isFunctionLike(node)) {
    metrics.functionCount += 1;
    metrics.functionLengths.push(lineSpan(sourceFile, node));
  }

  if (isControlFlowNode(node)) {
    metrics.controlFlowCount += 1;
    const nestedLevel = currentNesting + 1;
    metrics.maxNestingDepth = Math.max(metrics.maxNestingDepth, nestedLevel);
    ts.forEachChild(node, (child) => visit(sourceFile, child, metrics, nestedLevel));
    return;
  }

  if (isAnyKeyword(node)) {
    metrics.typeEscapeCount += 1;
  } else if (ts.isAsExpression(node)) {
    if (node.type.kind === ts.SyntaxKind.AnyKeyword) {
      metrics.typeEscapeCount += 1;
    } else if (
      ts.isAsExpression(node.expression) &&
      node.expression.type.kind === ts.SyntaxKind.UnknownKeyword
    ) {
      metrics.typeEscapeCount += 1;
    }
  }

  ts.forEachChild(node, (child) => visit(sourceFile, child, metrics, currentNesting));
}

export function analyzeFile(filePath: string): FileMetrics {
  const sourceText = readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    path.basename(filePath),
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const metrics = {
    functionLengths: [] as number[],
    functionCount: 0,
    maxNestingDepth: 0,
    controlFlowCount: 0,
    typeEscapeCount: 0,
  };

  visit(sourceFile, sourceFile, metrics, 0);

  return {
    path: filePath,
    loc: countLoc(sourceText),
    functionCount: metrics.functionCount,
    functionLengths: metrics.functionLengths,
    maxNestingDepth: metrics.maxNestingDepth,
    controlFlowCount: metrics.controlFlowCount,
    typeEscapeCount: metrics.typeEscapeCount,
  };
}
