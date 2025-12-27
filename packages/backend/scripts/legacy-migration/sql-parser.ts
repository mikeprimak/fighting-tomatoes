// SQL Parser Utility
// Parses MySQL INSERT statements from phpMyAdmin SQL dump files

import * as fs from 'fs';
import * as path from 'path';

/**
 * Parse a SQL dump file and extract INSERT statement values
 * @param filePath Path to the SQL file
 * @param tableName Optional: filter to specific table name (for files with multiple tables)
 * @returns Array of parsed row objects
 */
export function parseSqlDump<T extends Record<string, unknown>>(
  filePath: string,
  tableName?: string
): { tableName: string; rows: T[] }[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const results: { tableName: string; rows: T[] }[] = [];

  // Track current table structure
  let currentTable: string | null = null;
  let currentColumns: string[] = [];

  const lines = content.split('\n');
  let inInsert = false;
  let insertBuffer = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip comments and empty lines
    if (!line || line.startsWith('--') || line.startsWith('/*') || line.startsWith('*/')) {
      continue;
    }

    // Detect CREATE TABLE to get column names
    if (line.startsWith('CREATE TABLE')) {
      const match = line.match(/CREATE TABLE `([^`]+)`/);
      if (match) {
        currentTable = match[1];
        currentColumns = [];

        // Parse column names from subsequent lines until we hit a closing paren
        for (let j = i + 1; j < lines.length; j++) {
          const columnLine = lines[j].trim();
          if (columnLine.startsWith(')') || columnLine.startsWith('PRIMARY') ||
              columnLine.startsWith('KEY') || columnLine.startsWith('UNIQUE') ||
              columnLine.startsWith('INDEX')) {
            break;
          }
          const columnMatch = columnLine.match(/^`([^`]+)`/);
          if (columnMatch) {
            currentColumns.push(columnMatch[1]);
          }
        }
      }
    }

    // Detect INSERT statements
    if (line.startsWith('INSERT INTO')) {
      inInsert = true;
      insertBuffer = line;

      // Extract table name from INSERT
      const insertTableMatch = line.match(/INSERT INTO `([^`]+)`/);
      if (insertTableMatch) {
        currentTable = insertTableMatch[1];
      }

      // Check if INSERT specifies columns
      const columnsMatch = line.match(/INSERT INTO `[^`]+` \(([^)]+)\)/);
      if (columnsMatch) {
        currentColumns = columnsMatch[1].split(',').map(c => c.trim().replace(/`/g, ''));
      }
    }

    if (inInsert) {
      if (!line.startsWith('INSERT INTO')) {
        insertBuffer += ' ' + line;
      }

      // Check if INSERT statement is complete (ends with ;)
      if (line.endsWith(';')) {
        inInsert = false;

        // Skip if filtering by table name and this doesn't match
        if (tableName && currentTable !== tableName) {
          insertBuffer = '';
          continue;
        }

        // Parse the VALUES from the INSERT
        const rows = parseInsertValues<T>(insertBuffer, currentColumns);

        // Find or create result entry for this table
        let tableResult = results.find(r => r.tableName === currentTable);
        if (!tableResult) {
          tableResult = { tableName: currentTable || 'unknown', rows: [] };
          results.push(tableResult);
        }
        tableResult.rows.push(...rows);

        insertBuffer = '';
      }
    }
  }

  return results;
}

/**
 * Parse VALUES from an INSERT statement
 */
function parseInsertValues<T extends Record<string, unknown>>(
  insertStatement: string,
  columns: string[]
): T[] {
  const rows: T[] = [];

  // Find the VALUES portion
  const valuesMatch = insertStatement.match(/VALUES\s*(.+);?$/is);
  if (!valuesMatch) return rows;

  const valuesStr = valuesMatch[1];

  // Parse each row of values - they are comma-separated tuples
  // Each tuple is enclosed in parentheses: (val1, val2, val3)
  const rowStrings = splitValueRows(valuesStr);

  for (const rowStr of rowStrings) {
    const values = parseValueTuple(rowStr);

    if (values.length > 0 && columns.length > 0) {
      const row: Record<string, unknown> = {};
      for (let i = 0; i < Math.min(values.length, columns.length); i++) {
        row[columns[i]] = values[i];
      }
      rows.push(row as T);
    }
  }

  return rows;
}

/**
 * Split VALUES into individual row tuples
 * Handles: (1, 'a'), (2, 'b'), (3, 'c')
 */
function splitValueRows(valuesStr: string): string[] {
  const rows: string[] = [];
  let depth = 0;
  let current = '';
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }

    if (!inString && (char === "'" || char === '"')) {
      inString = true;
      stringChar = char;
      current += char;
      continue;
    }

    if (inString && char === stringChar) {
      inString = false;
      stringChar = '';
      current += char;
      continue;
    }

    if (!inString) {
      if (char === '(') {
        if (depth === 0) {
          current = '';
        } else {
          current += char;
        }
        depth++;
        continue;
      }

      if (char === ')') {
        depth--;
        if (depth === 0) {
          if (current.trim()) {
            rows.push(current.trim());
          }
          current = '';
        } else {
          current += char;
        }
        continue;
      }
    }

    if (depth > 0) {
      current += char;
    }
  }

  return rows;
}

/**
 * Parse a single value tuple: "1, 'hello', NULL, 'it''s great'"
 */
function parseValueTuple(tupleStr: string): unknown[] {
  const values: unknown[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = 0; i < tupleStr.length; i++) {
    const char = tupleStr[i];

    if (escaped) {
      // Handle escaped characters
      if (char === 'n') current += '\n';
      else if (char === 'r') current += '\r';
      else if (char === 't') current += '\t';
      else if (char === '0') current += '\0';
      else current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (!inString && (char === "'" || char === '"')) {
      inString = true;
      stringChar = char;
      continue;
    }

    if (inString && char === stringChar) {
      // Check for escaped quote ('' in SQL)
      if (i + 1 < tupleStr.length && tupleStr[i + 1] === stringChar) {
        current += char;
        i++; // Skip next quote
        continue;
      }
      inString = false;
      stringChar = '';
      continue;
    }

    if (!inString && char === ',') {
      values.push(parseValue(current.trim()));
      current = '';
      continue;
    }

    current += char;
  }

  // Don't forget the last value
  if (current.trim() || values.length > 0) {
    values.push(parseValue(current.trim()));
  }

  return values;
}

/**
 * Parse a single value string into its appropriate type
 */
function parseValue(valueStr: string): unknown {
  if (valueStr === '' || valueStr.toUpperCase() === 'NULL') {
    return null;
  }

  // Check if it's a number
  if (/^-?\d+$/.test(valueStr)) {
    return parseInt(valueStr, 10);
  }

  if (/^-?\d+\.\d+$/.test(valueStr)) {
    return parseFloat(valueStr);
  }

  // Return as string
  return valueStr;
}

/**
 * Get all table names that have INSERT data in a SQL file
 */
export function getTableNames(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const tables = new Set<string>();

  const regex = /INSERT INTO `([^`]+)`/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tables.add(match[1]);
  }

  return Array.from(tables);
}

/**
 * Count rows in a SQL dump file
 */
export function countRows(filePath: string): Map<string, number> {
  const results = parseSqlDump(filePath);
  const counts = new Map<string, number>();

  for (const result of results) {
    counts.set(result.tableName, result.rows.length);
  }

  return counts;
}
