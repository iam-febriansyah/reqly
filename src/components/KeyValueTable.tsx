import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { EnvironmentVariable, KeyValueItem } from "../types";
import { generateId, resolveVariablesInString } from "../services/api";

interface KeyValueTableProps {
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  descriptionPlaceholder?: string;
  variables?: EnvironmentVariable[];
  showDescription?: boolean;
}

export const KeyValueTable: React.FC<KeyValueTableProps> = ({
  items,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  descriptionPlaceholder = "Description",
  variables = [],
  showDescription = true,
}) => {
  const handleUpdate = (
    id: string,
    field: keyof KeyValueItem,
    val: string | boolean
  ) => {
    const next = items.map((item) =>
      item.id === id ? { ...item, [field]: val } : item
    );
    onChange(next);
  };

  const handleAddRow = () => {
    onChange([
      ...items,
      {
        id: generateId(),
        key: "",
        value: "",
        description: "",
        enabled: true,
      },
    ]);
  };

  const handleDeleteRow = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const renderVarHint = (text: string) => {
    if (!text.includes("{{")) return null;
    const { resolved, unresolved } = resolveVariablesInString(text, variables);
    if (unresolved.length > 0) {
      return (
        <span
          className="var-inline-chip var-unresolved"
          title={`Unresolved: ${unresolved.join(", ")}`}
        >
          Unresolved: {unresolved.join(", ")}
        </span>
      );
    }
    return (
      <span className="var-inline-chip var-resolved" title={`Resolves to: ${resolved}`}>
        = {resolved}
      </span>
    );
  };

  return (
    <div className="kv-table-wrapper">
      <table className="kv-table">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: showDescription ? "32%" : "44%" }}>Key</th>
            <th style={{ width: showDescription ? "40%" : "48%" }}>Value</th>
            {showDescription && <th>Description</th>}
            <th style={{ width: 36 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td
                colSpan={showDescription ? 5 : 4}
                className="kv-empty-row"
              >
                No entries configured. Click <strong>Add Row</strong> to add one.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr
                key={item.id}
                className={!item.enabled ? "kv-row-disabled" : ""}
              >
                <td className="kv-cell-check">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) =>
                      handleUpdate(item.id, "enabled", e.target.checked)
                    }
                    aria-label="Enable row"
                  />
                </td>
                <td>
                  <div className="kv-input-group">
                    <input
                      type="text"
                      className="kv-input mono-input"
                      placeholder={keyPlaceholder}
                      value={item.key}
                      onChange={(e) =>
                        handleUpdate(item.id, "key", e.target.value)
                      }
                    />
                    {renderVarHint(item.key)}
                  </div>
                </td>
                <td>
                  <div className="kv-input-group">
                    <input
                      type="text"
                      className="kv-input mono-input"
                      placeholder={valuePlaceholder}
                      value={item.value}
                      onChange={(e) =>
                        handleUpdate(item.id, "value", e.target.value)
                      }
                    />
                    {renderVarHint(item.value)}
                  </div>
                </td>
                {showDescription && (
                  <td>
                    <input
                      type="text"
                      className="kv-input"
                      placeholder={descriptionPlaceholder}
                      value={item.description}
                      onChange={(e) =>
                        handleUpdate(item.id, "description", e.target.value)
                      }
                    />
                  </td>
                )}
                <td className="kv-cell-actions">
                  <button
                    type="button"
                    className="icon-btn subtle-danger"
                    onClick={() => handleDeleteRow(item.id)}
                    title="Remove row"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="kv-footer">
        <button type="button" className="btn-secondary btn-xs" onClick={handleAddRow}>
          <Plus size={13} />
          <span>Add Row</span>
        </button>
      </div>
    </div>
  );
};

