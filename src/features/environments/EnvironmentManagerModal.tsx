import React, { useEffect, useState } from "react";
import { Check, Plus, Trash2, Layers } from "lucide-react";
import { Modal } from "../../components/Modal";
import { useAppStore } from "../../stores/useAppStore";
import type { Environment, EnvironmentVariable } from "../../types";
import { generateId } from "../../services/api";

export const EnvironmentManagerModal: React.FC = () => {
  const {
    activeProject,
    environments,
    envModalOpen,
    setEnvModalOpen,
    saveEnvironment,
    deleteEnvironment,
    setActiveEnvironmentId,
    showToast,
  } = useAppStore();

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [draftEnv, setDraftEnv] = useState<Environment | null>(null);
  const [newEnvName, setNewEnvName] = useState("");

  // Only initialize selected environment when opening the modal
  useEffect(() => {
    if (!envModalOpen) return;
    setSelectedEnvId((current) => {
      // If current is already pointing to an existing environment, keep it!
      if (current && environments.some((e) => e.id === current)) {
        return current;
      }
      return (
        activeProject?.activeEnvironmentId ||
        environments[0]?.id ||
        null
      );
    });
  }, [envModalOpen]); // Intentionally only depend on modal open

  // Sync draftEnv when switching selectedEnvId
  useEffect(() => {
    if (!selectedEnvId) {
      setDraftEnv(null);
      return;
    }
    const found = environments.find((e) => e.id === selectedEnvId);
    if (found) {
      setDraftEnv((prev) => {
        // If already editing this environment, don't overwrite user's in-progress typing
        if (prev && prev.id === found.id) {
          return prev;
        }
        return JSON.parse(JSON.stringify(found));
      });
    } else {
      setDraftEnv(null);
    }
  }, [selectedEnvId, environments]);

  if (!activeProject) return null;

  const handleCreateEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newEnvName.trim() || `Environment ${environments.length + 1}`;
    const now = new Date().toISOString();
    const created: Environment = {
      id: generateId(),
      projectId: activeProject.id,
      name,
      variables: [
        {
          id: generateId(),
          key: "BASE_URL",
          value: "http://localhost:8000",
          enabled: true,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    const saved = await saveEnvironment(created);
    setNewEnvName("");
    // Explicitly lock focus/selection to the newly created environment
    setSelectedEnvId(saved.id);
    setDraftEnv(JSON.parse(JSON.stringify(saved)));
    if (!activeProject.activeEnvironmentId) {
      await setActiveEnvironmentId(saved.id);
    }
    showToast(`Created environment "${saved.name}"`);
  };

  const handlePersistDraft = (next: Environment) => {
    setDraftEnv(next);
    saveEnvironment(next);
  };

  const handleVarChange = (
    varId: string,
    field: keyof EnvironmentVariable,
    value: string | boolean
  ) => {
    if (!draftEnv) return;
    const nextVars = draftEnv.variables.map((v) =>
      v.id === varId ? { ...v, [field]: value } : v
    );
    handlePersistDraft({ ...draftEnv, variables: nextVars });
  };

  const handleAddVariable = () => {
    if (!draftEnv) return;
    const nextVars: EnvironmentVariable[] = [
      ...draftEnv.variables,
      {
        id: generateId(),
        key: "",
        value: "",
        enabled: true,
      },
    ];
    handlePersistDraft({ ...draftEnv, variables: nextVars });
  };

  const handleDeleteVariable = (varId: string) => {
    if (!draftEnv) return;
    const nextVars = draftEnv.variables.filter((v) => v.id !== varId);
    handlePersistDraft({ ...draftEnv, variables: nextVars });
  };

  const handleDeleteEnvironment = async () => {
    if (!draftEnv) return;
    const envToDeleteId = draftEnv.id;
    await deleteEnvironment(envToDeleteId);
    const remaining = environments.filter((e) => e.id !== envToDeleteId);
    const nextId =
      activeProject.activeEnvironmentId &&
      activeProject.activeEnvironmentId !== envToDeleteId
        ? activeProject.activeEnvironmentId
        : remaining[0]?.id || null;
    setSelectedEnvId(nextId);
    showToast("Environment deleted");
  };

  return (
    <Modal
      open={envModalOpen}
      onClose={() => setEnvModalOpen(false)}
      title="Environment Variables"
      subtitle={`Manage {{VARIABLE_NAME}} environments for "${activeProject.name}". Original requests are never overwritten when variables resolve.`}
      width={780}
    >
      <div className="env-manager-layout">
        <div className="env-sidebar">
          <form onSubmit={handleCreateEnvironment} className="env-create-form">
            <input
              type="text"
              className="input-compact"
              placeholder="New environment..."
              value={newEnvName}
              onChange={(e) => setNewEnvName(e.target.value)}
            />
            <button
              type="submit"
              className="btn-primary btn-xs"
              title="Create environment"
            >
              <Plus size={13} />
            </button>
          </form>

          <div className="env-list">
            {environments.length === 0 ? (
              <div className="empty-hint">No environments yet</div>
            ) : (
              environments.map((env) => {
                const isActive = activeProject.activeEnvironmentId === env.id;
                const isSelected = selectedEnvId === env.id;
                return (
                  <div
                    key={env.id}
                    className={`env-list-item ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedEnvId(env.id)}
                  >
                    <div className="env-list-item-main">
                      <Layers size={13} className="muted-icon" />
                      <span className="env-list-name">{env.name}</span>
                    </div>
                    <div className="env-list-actions">
                      {isActive ? (
                        <span className="active-env-pill" title="Active environment">
                          Active
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost btn-xxs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveEnvironmentId(env.id);
                          }}
                        >
                          Use
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="env-editor-pane">
          {!draftEnv ? (
            <div className="empty-pane-message">
              Select or create an environment to manage variables.
            </div>
          ) : (
            <>
              <div className="env-editor-header">
                <div className="env-name-field">
                  <label className="field-label">Environment Name</label>
                  <input
                    type="text"
                    className="input-compact env-title-input"
                    value={draftEnv.name}
                    onChange={(e) =>
                      handlePersistDraft({ ...draftEnv, name: e.target.value })
                    }
                  />
                </div>
                <div className="env-header-buttons">
                  <button
                    type="button"
                    className={
                      activeProject.activeEnvironmentId === draftEnv.id
                        ? "btn-secondary btn-xs"
                        : "btn-primary btn-xs"
                    }
                    onClick={() =>
                      setActiveEnvironmentId(
                        activeProject.activeEnvironmentId === draftEnv.id
                          ? null
                          : draftEnv.id
                      )
                    }
                  >
                    <Check size={13} />
                    <span>
                      {activeProject.activeEnvironmentId === draftEnv.id
                        ? "Active in Project"
                        : "Set Active"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn-danger-ghost btn-xs"
                    onClick={handleDeleteEnvironment}
                    title="Delete environment"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              <div className="env-vars-table-wrap">
                <table className="kv-table">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}>On</th>
                      <th style={{ width: "38%" }}>Variable Name</th>
                      <th>Value</th>
                      <th style={{ width: 78 }}>Syntax</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftEnv.variables.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="kv-empty-row">
                          No variables in this environment. Click{" "}
                          <strong>Add Variable</strong> below.
                        </td>
                      </tr>
                    ) : (
                      draftEnv.variables.map((v) => (
                        <tr
                          key={v.id}
                          className={!v.enabled ? "kv-row-disabled" : ""}
                        >
                          <td className="kv-cell-check">
                            <input
                              type="checkbox"
                              checked={v.enabled}
                              onChange={(e) =>
                                handleVarChange(v.id, "enabled", e.target.checked)
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="kv-input mono-input"
                              placeholder="BASE_URL"
                              value={v.key}
                              onChange={(e) =>
                                handleVarChange(v.id, "key", e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="kv-input mono-input"
                              placeholder="https://api.example.com"
                              value={v.value}
                              onChange={(e) =>
                                handleVarChange(v.id, "value", e.target.value)
                              }
                            />
                          </td>
                          <td>
                            {v.key.trim() && (
                              <code
                                className="var-syntax-badge"
                                onClick={() => {
                                  navigator.clipboard?.writeText(
                                    `{{${v.key.trim()}}}`
                                  );
                                  showToast(`Copied {{${v.key.trim()}}}`);
                                }}
                                title="Click to copy placeholder"
                              >
                                {`{{${v.key.trim()}}}`}
                              </code>
                            )}
                          </td>
                          <td className="kv-cell-actions">
                            <button
                              type="button"
                              className="icon-btn subtle-danger"
                              onClick={() => handleDeleteVariable(v.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="env-footer">
                <button
                  type="button"
                  className="btn-secondary btn-xs"
                  onClick={handleAddVariable}
                >
                  <Plus size={13} />
                  <span>Add Variable</span>
                </button>
                <span className="env-usage-tip">
                  Reference variables in URL, Params, Headers, Body, or Auth as{" "}
                  <code>{"{{VARIABLE_NAME}}"}</code>
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
