import { Fragment, useEffect, useMemo, useRef, useState } from "react";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const DAY_MS = 24 * 60 * 60 * 1000;
const GANTT_DAY_WIDTH = 52;
const DATABASE_NAME = "control-produccion-db";
const STORE_NAME = "project";
const PROJECT_KEY = "current-project";
const DEFAULT_PRODUCTION_LINE_ID = "linea-produccion-default";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveProject(tasks, productionLines) {
  const database = await openDatabase();
  const savedAt = new Date().toISOString();
  const storableTasks = tasks.map(({ previewUrl, error, ...task }) => task);

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(
      { tasks: storableTasks, productionLines, savedAt },
      PROJECT_KEY,
    );
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });

  database.close();
  return savedAt;
}

async function loadProject() {
  const database = await openDatabase();
  const result = await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(PROJECT_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  database.close();
  return result;
}

function createTask(index) {
  return {
    id: crypto.randomUUID(),
    name: `Tarea ${index}`,
    productionLineId: DEFAULT_PRODUCTION_LINE_ID,
    activities: [""],
    file: null,
    previewUrl: "",
    startDate: "",
    endDate: "",
    originalStartDate: "",
    originalEndDate: "",
    materialCost: "",
    laborCost: "",
    subcontractCost: "",
    logisticsCost: "",
    progressPercent: "",
    nonComplianceNotes: [""],
    delayRecords: [],
    error: "",
  };
}

function duplicateTask(task, copyIndex) {
  const startDate = task.startDate || "";
  const endDate = task.endDate || "";

  return {
    ...task,
    id: crypto.randomUUID(),
    name: `${task.name || `Tarea ${copyIndex}`} copia`,
    activities: Array.isArray(task.activities) ? [...task.activities] : [""],
    nonComplianceNotes: Array.isArray(task.nonComplianceNotes)
      ? [...task.nonComplianceNotes]
      : [""],
    previewUrl: task.file ? URL.createObjectURL(task.file) : "",
    startDate,
    endDate,
    originalStartDate: startDate,
    originalEndDate: endDate,
    delayRecords: [],
    error: "",
  };
}

function createProductionLine(index, name = "") {
  return {
    id: index === 1 ? DEFAULT_PRODUCTION_LINE_ID : crypto.randomUUID(),
    name: name || `Eficiencia de linea de producción ${index}`,
  };
}

function parseDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function addDays(date, amount) {
  return new Date(date.getTime() + amount * DAY_MS);
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayDifference(start, end) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

function clampDateToRange(date, start, end) {
  if (start && date < start) return start;
  if (end && date > end) return end;
  return date;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function getTaskTotal(task) {
  return (
    (Number(task.materialCost) || 0) +
    (Number(task.laborCost) || 0) +
    (Number(task.subcontractCost) || 0) +
    (Number(task.logisticsCost) || 0)
  );
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function getTaskCompliance(task) {
  return Number(task.progressPercent) === 100;
}

function getTaskObservation(task) {
  const notes = Array.isArray(task.nonComplianceNotes)
    ? task.nonComplianceNotes
        .map((note) => note.trim())
        .filter(Boolean)
    : [];

  return notes.length ? notes.join(" · ") : "Sin observación";
}

function getTaskLineName(task, productionLines) {
  return (
    productionLines.find(
      (line) =>
        line.id === (task.productionLineId || DEFAULT_PRODUCTION_LINE_ID),
    )?.name || "Sin línea asignada"
  );
}

function QuickBrowser({
  groupedTasksByLine,
  productionLines,
  selectedTaskIds,
  onTaskSelect,
  onTaskSelectionChange,
  onSelectLineTasks,
  onClearSelection,
  onDuplicateSelected,
  onDeleteSelected,
  onAssignSelectedToLine,
  onDeleteLine,
}) {
  const selectedTasks = new Set(selectedTaskIds);
  const selectedCount = selectedTaskIds.length;
  return (
    <aside className="quick-browser" aria-label="Navegación rápida">
      <span className="quick-browser-kicker">Quick browser</span>
      <a href="#efficiency-monitor">Líneas de eficiencia</a>
      <div className="quick-browser-bulk">
        <strong>{selectedCount} seleccionadas</strong>
        <button
          type="button"
          onClick={onDuplicateSelected}
          disabled={!selectedCount}
        >
          Duplicar
        </button>
        <button
          className="quick-browser-danger"
          type="button"
          onClick={onDeleteSelected}
          disabled={!selectedCount}
        >
          Eliminar seleccionadas
        </button>
        <label>
          <span>Asignar a lÃ­nea</span>
          <select
            value=""
            disabled={!selectedCount}
            onChange={(event) => {
              if (!event.target.value) return;
              onAssignSelectedToLine(event.target.value);
            }}
          >
            <option value="">Mover a...</option>
            {productionLines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onClearSelection}
          disabled={!selectedCount}
        >
          Limpiar
        </button>
      </div>
      <nav>
        {groupedTasksByLine.map((line, lineIndex) => (
          <div className="quick-browser-group" key={line.id}>
            <a href={`#line-${line.id}`}>
              {String(lineIndex + 1).padStart(2, "0")} · {line.name}
            </a>
            <button
              className="quick-browser-select-line"
              type="button"
              onClick={() => onSelectLineTasks(line.tasks.map((task) => task.id))}
              disabled={!line.tasks.length}
            >
              Seleccionar Linea
            </button>
            <button
              className="quick-browser-delete-line"
              type="button"
              onClick={() => onDeleteLine(line.id)}
              disabled={productionLines.length <= 1}
            >
              Eliminar línea
            </button>
            {line.tasks.map((task) => (
              <div
                className={`quick-browser-task ${
                  selectedTasks.has(task.id) ? "is-selected" : ""
                }`}
                key={task.id}
              >
                <input
                  type="checkbox"
                  checked={selectedTasks.has(task.id)}
                  onChange={(event) =>
                    onTaskSelectionChange(task.id, event.target.checked)
                  }
                  aria-label={`Seleccionar ${task.name || "tarea sin nombre"}`}
                />
                <button
                  type="button"
                  onClick={() => onTaskSelect(task.id)}
                >
                  {task.name || "Tarea sin nombre"}
                </button>
              </div>
            ))}
          </div>
        ))}
      </nav>
      <a href="#production-gantt">Diagrama de Gantt</a>
    </aside>
  );
}

function ProductionEfficiencyMonitor({
  tasks,
  productionLines,
  onLineChange,
  onTaskSelect,
}) {
  const tableScrollRefs = useRef({});

  function scrollEfficiencyTable(lineId, direction) {
    const scrollContainer = tableScrollRefs.current[lineId];
    if (!scrollContainer) return;

    scrollContainer.scrollBy({
      left: direction * Math.max(280, scrollContainer.clientWidth * 0.65),
      behavior: "smooth",
    });
  }

  return (
    <section className="efficiency-section" id="efficiency-monitor">
      <div className="efficiency-heading">
        <div>
          <span className="eyebrow">Monitoreo global</span>
          <h2>Eficiencia de línea de producción</h2>
          <p>
            Agrupa las actividades de producción por línea de eficiencia y revisa
            cumplimiento, avance y causas de incumplimiento.
          </p>
        </div>
      </div>

      <div className="efficiency-lines">
        {productionLines.map((line, lineIndex) => {
          const lineTasks = tasks.filter(
            (task) => task.productionLineId === line.id,
          );
          const completedTasks = lineTasks.filter(getTaskCompliance).length;
          const progressTotal = lineTasks.reduce(
            (sum, task) => sum + (Number(task.progressPercent) || 0),
            0,
          );
          const executedEquivalent = progressTotal / 100;
          const lineEfficiency = lineTasks.length
            ? Math.round(progressTotal / lineTasks.length)
            : 0;

          return (
            <article className="efficiency-card" id={`line-${line.id}`} key={line.id}>
              <div className="efficiency-card-header">
                <button
                  className="efficiency-line-number"
                  type="button"
                  onClick={() => {
                    if (lineTasks[0]) onTaskSelect(lineTasks[0].id);
                  }}
                  disabled={!lineTasks.length}
                  title={
                    lineTasks.length
                      ? `Ir a las tareas de ${line.name}`
                      : "Esta línea aún no tiene tareas"
                  }
                >
                  {String(lineIndex + 1).padStart(2, "0")}
                </button>
                <label>
                  <small>Nombre de la línea</small>
                  <input
                    value={line.name}
                    onChange={(event) =>
                      onLineChange(line.id, { name: event.target.value })
                    }
                    aria-label={`Nombre de la línea de eficiencia ${lineIndex + 1}`}
                  />
                </label>
                <strong>{lineEfficiency}%</strong>
              </div>

              {lineTasks.length === 0 ? (
                <div className="efficiency-empty">
                  Esta línea aún no tiene tareas asignadas.
                </div>
              ) : (
                <>
                <div className="efficiency-scroll-controls">
                  <span>Desplazar tareas</span>
                  <div>
                    <button
                      type="button"
                      onClick={() => scrollEfficiencyTable(line.id, -1)}
                      aria-label={`Mover ${line.name} a la izquierda`}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollEfficiencyTable(line.id, 1)}
                      aria-label={`Mover ${line.name} a la derecha`}
                    >
                      →
                    </button>
                  </div>
                </div>
                <div
                  className="efficiency-table-scroll"
                  ref={(element) => {
                    if (element) tableScrollRefs.current[line.id] = element;
                  }}
                >
                  <div
                    className="efficiency-table"
                    style={{ "--efficiency-task-count": lineTasks.length }}
                  >
                    <div className="efficiency-row efficiency-header-row">
                      <div>Eficiencia de la línea de producción</div>
                      <div>{lineEfficiency}%</div>
                      {lineTasks.map((task) => (
                        <button
                          type="button"
                          key={task.id}
                          onClick={() => onTaskSelect(task.id)}
                          title={`Ir a ${task.name}`}
                        >
                          {task.name || "Tarea sin nombre"}
                        </button>
                      ))}
                    </div>

                    <div className="efficiency-row">
                      <div>Procesos planeados</div>
                      <div>{lineTasks.length}</div>
                      {lineTasks.map((_, taskIndex) => (
                        <div key={`planned-${line.id}-${taskIndex}`}>{taskIndex + 1}</div>
                      ))}
                    </div>

                    <div className="efficiency-row">
                      <div>Procesos ejecutados en obra</div>
                      <div>{Number.isInteger(executedEquivalent) ? executedEquivalent : executedEquivalent.toFixed(2)}</div>
                      {lineTasks.map((task) => (
                        <div key={`executed-${task.id}`}>
                          {((Number(task.progressPercent) || 0) / 100).toFixed(2)}
                        </div>
                      ))}
                    </div>

                    <div className="efficiency-row">
                      <div>Porcentaje de cumplimiento vs avance diario</div>
                      <div>{lineEfficiency}%</div>
                      {lineTasks.map((task) => (
                        <div key={`progress-${task.id}`}>
                          {Number(task.progressPercent) || 0}%
                        </div>
                      ))}
                    </div>

                    <div className="efficiency-row">
                      <div>Cumplimiento</div>
                      <div>{completedTasks}/{lineTasks.length}</div>
                      {lineTasks.map((task) => (
                        <div
                          className={
                            getTaskCompliance(task)
                              ? "efficiency-complied"
                              : "efficiency-not-complied"
                          }
                          key={`status-${task.id}`}
                        >
                          {getTaskCompliance(task) ? "CUMPLIO" : "NO CUMPLIO"}
                        </div>
                      ))}
                    </div>

                    <div className="efficiency-row efficiency-observation-row">
                      <div>Observaciones / causa</div>
                      <div>-</div>
                      {lineTasks.map((task) => (
                        <div key={`notes-${task.id}`}>
                          {getTaskCompliance(task) ? "Sin observación" : getTaskObservation(task)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TaskCard({
  task,
  index,
  productionLines,
  onChange,
  onRemove,
  onRegisterDelay,
  onRemoveAdjustment,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  isHighlighted,
}) {
  const fileInputRef = useRef(null);
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const adjustmentDateRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [delayDate, setDelayDate] = useState("");
  const [delayDays, setDelayDays] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("delay");

  useEffect(() => {
    if (!delayDate && task.endDate) setDelayDate(task.endDate);
  }, [task.endDate, delayDate]);

  function loadFile(file) {
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      onChange({ error: "Selecciona un archivo JPG, JPEG, PNG o PDF." });
      return;
    }

    if (task.previewUrl) URL.revokeObjectURL(task.previewUrl);

    onChange({
      file,
      previewUrl: URL.createObjectURL(file),
      error: "",
    });
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
  }

  function removeFile() {
    if (task.previewUrl) URL.revokeObjectURL(task.previewUrl);
    onChange({ file: null, previewUrl: "", error: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateActivity(activityIndex, value) {
    onChange({
      activities: task.activities.map((activity, currentIndex) =>
        currentIndex === activityIndex ? value : activity,
      ),
    });
  }

  function addActivity() {
    onChange({ activities: [...task.activities, ""] });
  }

  function removeActivity(activityIndex) {
    if (task.activities.length === 1) {
      onChange({ activities: [""] });
      return;
    }

    onChange({
      activities: task.activities.filter(
        (_, currentIndex) => currentIndex !== activityIndex,
      ),
    });
  }

  function updateNonComplianceNote(noteIndex, value) {
    onChange({
      nonComplianceNotes: task.nonComplianceNotes.map((note, currentIndex) =>
        currentIndex === noteIndex ? value : note,
      ),
    });
  }

  function addNonComplianceNote() {
    onChange({ nonComplianceNotes: [...task.nonComplianceNotes, ""] });
  }

  function removeNonComplianceNote(noteIndex) {
    if (task.nonComplianceNotes.length === 1) {
      onChange({ nonComplianceNotes: [""] });
      return;
    }

    onChange({
      nonComplianceNotes: task.nonComplianceNotes.filter(
        (_, currentIndex) => currentIndex !== noteIndex,
      ),
    });
  }

  function updateProgressPercent(value) {
    if (value === "") {
      onChange({ progressPercent: "" });
      return;
    }

    const numericValue = Math.max(0, Math.min(100, Number(value)));
    onChange({ progressPercent: String(numericValue) });
  }

  const invalidDates =
    task.startDate &&
    task.endDate &&
    parseDate(task.endDate) < parseDate(task.startDate);
  const totalCost = getTaskTotal(task);
  const progressValue = Number(task.progressPercent) || 0;
  const taskComplied = progressValue === 100;
  const maximumAdvanceDays =
    task.startDate && task.endDate
      ? Math.max(0, dayDifference(parseDate(task.startDate), parseDate(task.endDate)))
      : 0;
  const canRegisterDelay =
    task.startDate &&
    task.endDate &&
    delayDate &&
    Number(delayDays) > 0 &&
    (adjustmentType === "delay" ||
      Number(delayDays) <= maximumAdvanceDays) &&
    !invalidDates;
  const progressSection = (
    <div className="progress-section progress-section-left">
      <div className="section-title">
        <span>Avance de ejecución</span>
        <strong>Porcentaje de avance</strong>
      </div>

      <label className="field-label">
        <span>Avance reportado por el usuario</span>
        <div className="progress-control">
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            placeholder="0"
            value={task.progressPercent}
            onChange={(event) =>
              updateProgressPercent(event.target.value)
            }
            aria-label={`Porcentaje de avance de ${task.name}`}
          />
          <small>%</small>
        </div>
      </label>

      <div
        className={`compliance-display ${
          taskComplied ? "is-complete" : "is-incomplete"
        }`}
      >
        <span>Estado de cumplimiento</span>
        <strong>{taskComplied ? "Cumplio" : "No Cumplio"}</strong>
      </div>

      {!taskComplied && (
        <div className="non-compliance-field">
          <div className="activities-heading">
            <div>
              <span>Descripción de incumplimiento</span>
              <small>
                Agrega las causas o actividades pendientes que impidieron cumplir.
              </small>
            </div>
            <button type="button" onClick={addNonComplianceNote}>
              ＋ Agregar causa
            </button>
          </div>

          <div className="activities-table non-compliance-table">
            <div className="activities-table-header">
              <span>No.</span>
              <span>Causa / actividad pendiente</span>
              <span>Acción</span>
            </div>

            {task.nonComplianceNotes.map((note, noteIndex) => (
              <div
                className="activity-row"
                key={`${task.id}-non-compliance-${noteIndex}`}
              >
                <span className="activity-number">{noteIndex + 1}</span>
                <textarea
                  rows="1"
                  value={note}
                  onChange={(event) =>
                    updateNonComplianceNote(noteIndex, event.target.value)
                  }
                  placeholder={`Describe la causa ${noteIndex + 1}`}
                  aria-label={`Causa de incumplimiento ${noteIndex + 1} de ${task.name}`}
                />
                <button
                  type="button"
                  onClick={() => removeNonComplianceNote(noteIndex)}
                  aria-label={`Eliminar causa ${noteIndex + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button
            className="add-activity-row-button"
            type="button"
            onClick={addNonComplianceNote}
          >
            ＋ Agregar otra causa
          </button>
        </div>
      )}
    </div>
  );

  return (
    <article
      id={`task-${task.id}`}
      className={`task-card ${isHighlighted ? "task-card-highlighted" : ""}`}
    >
      <div className="task-card-header">
        <div className="task-identity">
          <span className="task-number">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <span className="task-kicker">Actividad de producción</span>
            <input
              className="task-name-input"
              value={task.name}
              onChange={(event) => onChange({ name: event.target.value })}
              aria-label={`Nombre de la tarea ${index + 1}`}
            />
            <label className="production-line-picker">
              <span>Línea de eficiencia</span>
              <select
                value={task.productionLineId || DEFAULT_PRODUCTION_LINE_ID}
                onChange={(event) =>
                  onChange({ productionLineId: event.target.value })
                }
                aria-label={`Línea de eficiencia asignada a ${task.name}`}
              >
                {productionLines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="task-header-actions">
          <div className="task-order-controls" aria-label={`Orden de ${task.name}`}>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              aria-label={`Subir ${task.name}`}
              title="Subir tarea"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              aria-label={`Bajar ${task.name}`}
              title="Bajar tarea"
            >
              ↓
            </button>
          </div>
          <button
            className="remove-task-button"
            type="button"
            onClick={onRemove}
            aria-label={`Eliminar ${task.name}`}
          >
            Eliminar tarea
          </button>
        </div>
      </div>

      <div className="task-content-grid">
        <section className="task-document">
          {!task.file ? (
            <div
              className={`drop-zone ${dragging ? "is-dragging" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
            >
              <div className="upload-icon" aria-hidden="true">↑</div>
              <h3>Agrega la imagen de esta tarea</h3>
              <p>Arrastra el archivo o haz clic para buscarlo</p>
              <span className="file-types">JPG, PNG o PDF</span>
            </div>
          ) : (
            <div className="file-card">
              <div className="file-meta">
                <div className="file-type-icon">
                  {task.file.type === "application/pdf" ? "PDF" : "IMG"}
                </div>
                <div>
                  <strong>{task.file.name}</strong>
                  <span>{formatFileSize(task.file.size)}</span>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={removeFile}
                  aria-label="Quitar archivo"
                >
                  ×
                </button>
              </div>

              <div className="preview-frame">
                {task.file.type === "application/pdf" ? (
                  <iframe src={task.previewUrl} title={`Vista previa de ${task.file.name}`} />
                ) : (
                  <img src={task.previewUrl} alt={`Vista previa de ${task.file.name}`} />
                )}
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                Cambiar archivo
              </button>
            </div>
          )}

          <div className="activities-field">
            <div className="activities-heading">
              <div>
                <span>Descripción de la tarea</span>
                <small>Agrega las actividades en el orden de ejecución.</small>
              </div>
              <button type="button" onClick={addActivity}>
                ＋ Agregar actividad
              </button>
            </div>

            <div className="activities-table">
              <div className="activities-table-header">
                <span>No.</span>
                <span>Actividad a ejecutar</span>
                <span>Acción</span>
              </div>

              {task.activities.map((activity, activityIndex) => (
                <div className="activity-row" key={`${task.id}-${activityIndex}`}>
                  <span className="activity-number">{activityIndex + 1}</span>
                  <textarea
                    rows="1"
                    value={activity}
                    onChange={(event) =>
                      updateActivity(activityIndex, event.target.value)
                    }
                    placeholder={`Escribe la actividad ${activityIndex + 1}`}
                    aria-label={`Actividad ${activityIndex + 1} de ${task.name}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeActivity(activityIndex)}
                    aria-label={`Eliminar actividad ${activityIndex + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button className="add-activity-row-button" type="button" onClick={addActivity}>
              ＋ Agregar otra fila
            </button>
          </div>

          {progressSection}

          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            onChange={(event) => loadFile(event.target.files?.[0])}
          />
          {task.error && <p className="error-message">{task.error}</p>}
        </section>

        <section className="task-data">
          <div className="section-title">
            <span>Calendario</span>
            <strong>Periodo de la tarea</strong>
          </div>

          <div className="date-fields">
            <label className="field-label">
              <span>Fecha de inicio</span>
              <div className="date-control">
                <input
                  ref={startDateRef}
                  type="date"
                  value={task.startDate}
                  max={task.endDate || undefined}
                  onInput={(event) => onChange({ startDate: event.currentTarget.value })}
                  onChange={(event) => onChange({ startDate: event.target.value })}
                />
                <button type="button" onClick={() => startDateRef.current?.showPicker?.()}>
                  Elegir
                </button>
              </div>
            </label>

            <label className="field-label">
              <span>Fecha final</span>
              <div className="date-control">
                <input
                  ref={endDateRef}
                  type="date"
                  value={task.endDate}
                  min={task.startDate || undefined}
                  onInput={(event) => onChange({ endDate: event.currentTarget.value })}
                  onChange={(event) => onChange({ endDate: event.target.value })}
                />
                <button type="button" onClick={() => endDateRef.current?.showPicker?.()}>
                  Elegir
                </button>
              </div>
            </label>
          </div>

          {invalidDates && (
            <p className="error-message">
              La fecha final debe ser igual o posterior a la fecha de inicio.
            </p>
          )}

          <div className="delay-section">
            <div className="section-title">
              <span>Control de desviaciones</span>
              <strong>Registrar ajuste de calendario</strong>
            </div>

            <div className="adjustment-type-control">
              <button
                className={adjustmentType === "delay" ? "is-active delay-option" : ""}
                type="button"
                onClick={() => setAdjustmentType("delay")}
              >
                Retraso
              </button>
              <button
                className={adjustmentType === "advance" ? "is-active advance-option" : ""}
                type="button"
                onClick={() => setAdjustmentType("advance")}
              >
                Avance
              </button>
            </div>

            <div className="delay-fields">
              <label className="field-label">
                <span>Fecha en que ocurrió</span>
                <div className="date-control">
                  <input
                    ref={adjustmentDateRef}
                    type="date"
                    value={delayDate}
                    min={task.originalStartDate || task.startDate || undefined}
                    max={task.endDate || undefined}
                    onInput={(event) => setDelayDate(event.currentTarget.value)}
                    onChange={(event) => setDelayDate(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => adjustmentDateRef.current?.showPicker?.()}
                  >
                    Elegir
                  </button>
                </div>
              </label>

              <label className="field-label">
                <span>
                  Días de {adjustmentType === "delay" ? "retraso" : "avance"}
                </span>
                <input
                  className="standalone-input"
                  type="number"
                  min="1"
                  max={
                    adjustmentType === "advance"
                      ? maximumAdvanceDays || undefined
                      : undefined
                  }
                  step="1"
                  placeholder="Ej. 3"
                  value={delayDays}
                  onChange={(event) => setDelayDays(event.target.value)}
                />
              </label>
            </div>

            <button
              className="delay-button"
              type="button"
              disabled={!canRegisterDelay}
              onClick={() => {
                onRegisterDelay({
                  date: delayDate,
                  days:
                    adjustmentType === "delay"
                      ? Number(delayDays)
                      : -Number(delayDays),
                });
                setDelayDays("");
                setDelayDate("");
              }}
            >
              Registrar {adjustmentType === "delay" ? "retraso" : "avance"}
            </button>

            {task.delayRecords.length > 0 && (
              <div className="delay-history">
                <span>Historial de ajustes</span>
                {task.delayRecords.map((record) => (
                  <div key={record.id}>
                    <div>
                      <strong className={record.days < 0 ? "advance-text" : ""}>
                        {record.days > 0 ? "+" : ""}
                        {record.days} {Math.abs(record.days) === 1 ? "día" : "días"}
                      </strong>
                      <small>
                        {record.days > 0 ? "Retraso" : "Avance"} registrado el{" "}
                        {new Intl.DateTimeFormat("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }).format(parseDate(record.date))}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveAdjustment(record.id)}
                      aria-label={`Eliminar ajuste de ${record.days} días`}
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="cost-section">
            <div className="section-title">
              <span>Presupuesto</span>
              <strong>Costos de la tarea</strong>
            </div>

            <div className="cost-fields">
              <label className="field-label">
                <span>Costo de materiales</span>
                <div className="money-control">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={task.materialCost}
                    onChange={(event) => onChange({ materialCost: event.target.value })}
                  />
                  <small>MXN</small>
                </div>
              </label>

              <label className="field-label">
                <span>Costo de mano de obra</span>
                <div className="money-control">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={task.laborCost}
                    onChange={(event) => onChange({ laborCost: event.target.value })}
                  />
                  <small>MXN</small>
                </div>
              </label>

              <label className="field-label">
                <span>Costo de subcontrato</span>
                <div className="money-control">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={task.subcontractCost}
                    onChange={(event) => onChange({ subcontractCost: event.target.value })}
                  />
                  <small>MXN</small>
                </div>
              </label>

              <label className="field-label">
                <span>Costo de logística (día a día)</span>
                <div className="money-control">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={task.logisticsCost}
                    onChange={(event) => onChange({ logisticsCost: event.target.value })}
                  />
                  <small>MXN</small>
                </div>
              </label>
            </div>

            <div className="task-total">
              <span>Costo total de la tarea</span>
              <strong>{formatMoney(totalCost)}</strong>
            </div>

            <div className="progress-section-right-removed">
              <div className="section-title">
                <span>Avance de ejecución</span>
                <strong>Porcentaje de avance</strong>
              </div>

              <label className="field-label">
                <span>Avance reportado por el usuario</span>
                <div className="progress-control">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="0"
                    value={task.progressPercent}
                    onChange={(event) =>
                      updateProgressPercent(event.target.value)
                    }
                    aria-label={`Porcentaje de avance de ${task.name}`}
                  />
                  <small>%</small>
                </div>
              </label>

              <div
                className={`compliance-display ${
                  taskComplied ? "is-complete" : "is-incomplete"
                }`}
              >
                <span>Estado de cumplimiento</span>
                <strong>{taskComplied ? "Cumplio" : "No Cumplio"}</strong>
              </div>

              {!taskComplied && (
                <div className="non-compliance-field">
                  <div className="activities-heading">
                    <div>
                      <span>Descripción de incumplimiento</span>
                      <small>
                        Agrega las causas o actividades pendientes que impidieron cumplir.
                      </small>
                    </div>
                    <button type="button" onClick={addNonComplianceNote}>
                      ＋ Agregar causa
                    </button>
                  </div>

                  <div className="activities-table non-compliance-table">
                    <div className="activities-table-header">
                      <span>No.</span>
                      <span>Causa / actividad pendiente</span>
                      <span>Acción</span>
                    </div>

                    {task.nonComplianceNotes.map((note, noteIndex) => (
                      <div
                        className="activity-row"
                        key={`${task.id}-non-compliance-${noteIndex}`}
                      >
                        <span className="activity-number">{noteIndex + 1}</span>
                        <textarea
                          rows="1"
                          value={note}
                          onChange={(event) =>
                            updateNonComplianceNote(noteIndex, event.target.value)
                          }
                          placeholder={`Describe la causa ${noteIndex + 1}`}
                          aria-label={`Causa de incumplimiento ${noteIndex + 1} de ${task.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => removeNonComplianceNote(noteIndex)}
                          aria-label={`Eliminar causa ${noteIndex + 1}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    className="add-activity-row-button"
                    type="button"
                    onClick={addNonComplianceNote}
                  >
                    ＋ Agregar otra causa
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}

function GanttChart({
  tasks,
  productionLines,
  onTaskSelect,
  onDeleteAdjustment,
  onExtendTask,
  onMoveTask,
  onResizeTask,
  onLineSelect,
  selectedTaskIds,
  onTaskSelectionChange,
}) {
  const dragInteractionRef = useRef(null);
  const [draggingTask, setDraggingTask] = useState(null);
  const selectedTasks = new Set(selectedTaskIds);
  const scheduledTasks = tasks.filter(
    (task) =>
      task.startDate &&
      task.endDate &&
      parseDate(task.endDate) >= parseDate(task.startDate),
  );
  const groupedScheduledTasks = productionLines
    .map((line, lineIndex) => ({
      ...line,
      orderLabel: String(lineIndex + 1).padStart(2, "0"),
      tasks: scheduledTasks.filter(
        (task) =>
          (task.productionLineId || DEFAULT_PRODUCTION_LINE_ID) === line.id,
      ),
    }))
    .filter((line) => line.tasks.length > 0);
  const orphanScheduledTasks = scheduledTasks.filter(
    (task) =>
      !productionLines.some(
        (line) =>
          line.id === (task.productionLineId || DEFAULT_PRODUCTION_LINE_ID),
      ),
  );

  if (orphanScheduledTasks.length) {
    groupedScheduledTasks.push({
      id: "linea-sin-asignar",
      name: "Sin línea de eficiencia",
      orderLabel: String(groupedScheduledTasks.length + 1).padStart(2, "0"),
      tasks: orphanScheduledTasks,
    });
  }

  const timeline = useMemo(() => {
    if (!scheduledTasks.length) return null;

    const starts = scheduledTasks.map((task) => parseDate(task.startDate));
    const ends = scheduledTasks.map((task) => parseDate(task.endDate));
    const originalStarts = scheduledTasks.map((task) =>
      parseDate(task.originalStartDate || task.startDate),
    );
    const originalEnds = scheduledTasks.map((task) =>
      parseDate(task.originalEndDate || task.endDate),
    );
    const delayDates = scheduledTasks.flatMap((task) =>
      task.delayRecords.map((record) => parseDate(record.date)),
    );
    const start = new Date(
      Math.min(...starts, ...originalStarts, ...delayDates),
    );
    const end = new Date(Math.max(...ends, ...originalEnds, ...delayDates));
    const totalDays = dayDifference(start, end) + 1;
    const days = Array.from({ length: totalDays }, (_, index) => addDays(start, index));

    return { start, end, totalDays, days };
  }, [tasks]);

  const delayEvents = scheduledTasks.flatMap((task) =>
    task.delayRecords.map((record) => ({
      ...record,
      taskId: task.id,
      taskName: task.name,
      lineId: productionLines.some(
        (line) =>
          line.id === (task.productionLineId || DEFAULT_PRODUCTION_LINE_ID),
      )
        ? task.productionLineId || DEFAULT_PRODUCTION_LINE_ID
        : "linea-sin-asignar",
    })),
  );

  const totalMaterials = tasks.reduce(
    (sum, task) => sum + (Number(task.materialCost) || 0),
    0,
  );
  const totalLabor = tasks.reduce(
    (sum, task) => sum + (Number(task.laborCost) || 0),
    0,
  );
  const totalSubcontracts = tasks.reduce(
    (sum, task) => sum + (Number(task.subcontractCost) || 0),
    0,
  );
  const totalLogistics = tasks.reduce(
    (sum, task) => sum + (Number(task.logisticsCost) || 0),
    0,
  );
  const grandTotal =
    totalMaterials + totalLabor + totalSubcontracts + totalLogistics;

  function startTaskDrag(event, taskId, mode = "move") {
    if (event.button !== 0) return;
    event.stopPropagation();

    event.currentTarget.setPointerCapture?.(event.pointerId);
    const affectedTaskIds =
      mode === "move" && selectedTasks.has(taskId)
        ? selectedTaskIds
        : [taskId];
    dragInteractionRef.current = {
      taskId,
      mode,
      affectedTaskIds,
      pointerId: event.pointerId,
      startX: event.clientX,
      deltaDays: 0,
    };
    setDraggingTask({ taskId, mode, deltaDays: 0 });
  }

  function moveTaskDrag(event, taskId) {
    const interaction = dragInteractionRef.current;
    if (!interaction || interaction.taskId !== taskId) return;

    const deltaDays = Math.round(
      (event.clientX - interaction.startX) / GANTT_DAY_WIDTH,
    );

    if (deltaDays !== interaction.deltaDays) {
      dragInteractionRef.current = { ...interaction, deltaDays };
      setDraggingTask({ taskId, mode: interaction.mode, deltaDays });
    }
  }

  function endTaskDrag(event, taskId) {
    const interaction = dragInteractionRef.current;
    if (!interaction || interaction.taskId !== taskId) return;

    event.currentTarget.releasePointerCapture?.(interaction.pointerId);
    dragInteractionRef.current = null;
    setDraggingTask(null);

    if (interaction.deltaDays !== 0) {
      if (interaction.mode === "move") {
        onMoveTask(interaction.affectedTaskIds, interaction.deltaDays);
      } else {
        onResizeTask(taskId, interaction.mode, interaction.deltaDays);
      }
    }
  }

  function cancelTaskDrag() {
    dragInteractionRef.current = null;
    setDraggingTask(null);
  }

  return (
    <section className="gantt-section" id="production-gantt">
      <div className="gantt-heading">
        <div>
          <span className="eyebrow">Planeación visual</span>
          <h2>Calendario de producción</h2>
          <p>Las fechas de cada tarea se reflejan automáticamente en el diagrama.</p>
        </div>
        <div className="budget-summary">
          <div>
            <span>Materiales</span>
            <strong>{formatMoney(totalMaterials)}</strong>
          </div>
          <div>
            <span>Mano de obra</span>
            <strong>{formatMoney(totalLabor)}</strong>
          </div>
          <div>
            <span>Subcontratos</span>
            <strong>{formatMoney(totalSubcontracts)}</strong>
          </div>
          <div>
            <span>Logística diaria</span>
            <strong>{formatMoney(totalLogistics)}</strong>
          </div>
          <div className="grand-total">
            <span>Inversión total</span>
            <strong>{formatMoney(grandTotal)}</strong>
          </div>
        </div>
      </div>

      {!timeline ? (
        <div className="gantt-empty">
          <span className="gantt-empty-icon">▥</span>
          <strong>El Gantt aparecerá aquí</strong>
          <p>Define la fecha de inicio y final de una tarea para comenzar.</p>
        </div>
      ) : (
        <div className="gantt-scroll">
          <div
            className="gantt-table"
            style={{ "--day-count": timeline.totalDays }}
          >
            <div className="gantt-corner">
              <strong>Tareas</strong>
              <span>{scheduledTasks.length} programadas</span>
            </div>

            <div className="gantt-total-header">
              <span>Costo por tarea</span>
              <strong>Total</strong>
            </div>

            <div className="gantt-calendar-header">
              {timeline.days.map((day) => (
                <div className="gantt-day" key={day.toISOString()}>
                  <span>{day.toLocaleDateString("es-MX", { weekday: "short" })}</span>
                  <strong>{day.getDate()}</strong>
                  <small>{day.toLocaleDateString("es-MX", { month: "short" })}</small>
                </div>
              ))}
              {delayEvents.map((record) => {
                const markerOffset = dayDifference(
                  timeline.start,
                  parseDate(record.date),
                );

                return (
                  <button
                    className={`gantt-delay-header-marker ${
                      record.days < 0 ? "is-advance" : ""
                    }`}
                    type="button"
                    key={`header-${record.id}`}
                    onClick={() =>
                      onDeleteAdjustment(record.taskId, record.id)
                    }
                    style={{ gridColumn: markerOffset + 1 }}
                    title={`Eliminar ${
                      record.days > 0 ? "retraso" : "avance"
                    } de ${Math.abs(record.days)} días en ${record.taskName}`}
                  >
                    <span>!</span>
                  </button>
                );
              })}
            </div>

            {groupedScheduledTasks
              .flatMap((line) =>
                line.tasks.map((task, index) => ({ task, index, line })),
              )
              .map(({ task, index, line }) => {
              const taskStart = parseDate(task.startDate);
              const taskEnd = parseDate(task.endDate);
              const offset = dayDifference(timeline.start, taskStart);
              const duration = dayDifference(taskStart, taskEnd) + 1;
              const taskTotal = getTaskTotal(task);
              const originalStart = parseDate(
                task.originalStartDate || task.startDate,
              );
              const originalEnd = parseDate(
                task.originalEndDate || task.endDate,
              );
              const originalOffset = dayDifference(
                timeline.start,
                originalStart,
              );
              const originalDuration =
                dayDifference(originalStart, originalEnd) + 1;
              const scheduleChanged =
                task.startDate !== (task.originalStartDate || task.startDate) ||
                task.endDate !== (task.originalEndDate || task.endDate);
              const activeDrag =
                draggingTask?.taskId === task.id ||
                (draggingTask?.mode === "move" && selectedTasks.has(task.id))
                  ? draggingTask
                  : null;
              const resizeDelta = activeDrag?.deltaDays || 0;
              const previewOffset =
                activeDrag?.mode === "start"
                  ? offset + Math.min(resizeDelta, duration - 1)
                  : offset;
              const previewDuration =
                activeDrag?.mode === "start"
                  ? Math.max(1, duration - resizeDelta)
                  : activeDrag?.mode === "end"
                    ? Math.max(1, duration + resizeDelta)
                    : duration;
              const previewTransform =
                activeDrag?.mode === "move"
                  ? `translateX(${resizeDelta * GANTT_DAY_WIDTH}px)`
                  : undefined;

              return (
                <Fragment key={task.id}>
                  {index === 0 && (
                    <div className="gantt-line-row">
                      <button
                        className="gantt-line-heading"
                        type="button"
                        onClick={() => onLineSelect(line.id)}
                        title={`Ir al resumen de ${line.name}`}
                      >
                        <span>{line.orderLabel}</span>
                        <div>
                          <strong>{line.name}</strong>
                          <small>
                            {line.tasks.length}{" "}
                            {line.tasks.length === 1 ? "tarea" : "tareas"}
                          </small>
                        </div>
                      </button>
                      <div className="gantt-line-track" aria-hidden="true">
                        {timeline.days.map((day) => (
                          <span className="gantt-grid-cell" key={day.toISOString()} />
                        ))}
                      </div>
                      <div className="gantt-line-total">
                        <span>Línea</span>
                      </div>
                    </div>
                  )}
                  <div className="gantt-row">
                  <div
                    className={`gantt-task-label ${
                      selectedTasks.has(task.id) ? "is-selected" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTasks.has(task.id)}
                      onChange={(event) =>
                        onTaskSelectionChange(task.id, event.target.checked)
                      }
                      aria-label={`Seleccionar ${task.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => onTaskSelect(task.id)}
                      title={`Ir a ${task.name}`}
                    >
                    <span>{String(tasks.indexOf(task) + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{task.name || `Tarea ${index + 1}`}</strong>
                      <em>{line.name}</em>
                      <small>
                        {formatShortDate(taskStart)} – {formatShortDate(taskEnd)}
                      </small>
                    </div>
                    </button>
                  </div>
                  <div className="gantt-track">
                    {timeline.days.map((day) => (
                      <span className="gantt-grid-cell" key={day.toISOString()} />
                    ))}
                    {delayEvents
                      .filter((record) => record.lineId === line.id)
                      .map((record) => {
                      const guideOffset = dayDifference(
                        timeline.start,
                        parseDate(record.date),
                      );

                      return (
                        <span
                          className={`gantt-delay-guide ${
                            record.days < 0 ? "is-advance" : ""
                          }`}
                          key={`guide-${task.id}-${record.id}`}
                          style={{ gridColumn: guideOffset + 1 }}
                        />
                      );
                    })}
                    {scheduleChanged && (
                      <button
                        className="gantt-original-bar"
                        type="button"
                        style={{
                          gridColumn: `${originalOffset + 1} / span ${originalDuration}`,
                        }}
                        title={`Periodo original: ${task.originalStartDate} a ${task.originalEndDate}`}
                      >
                        <span>Original</span>
                      </button>
                    )}
                    <button
                      className={`gantt-bar ${
                        activeDrag ? "is-dragging" : ""
                      } ${
                        selectedTasks.has(task.id) ? "is-selected" : ""
                      }`}
                      type="button"
                      onPointerDown={(event) => startTaskDrag(event, task.id, "move")}
                      onPointerMove={(event) => moveTaskDrag(event, task.id)}
                      onPointerUp={(event) => endTaskDrag(event, task.id)}
                      onPointerCancel={cancelTaskDrag}
                      style={{
                        gridColumn: `${previewOffset + 1} / span ${previewDuration}`,
                        transform: previewTransform,
                      }}
                      title={
                        selectedTasks.has(task.id) && selectedTaskIds.length > 1
                          ? `Mover ${selectedTaskIds.length} tareas seleccionadas`
                          : `Mover ${task.name}: ${task.startDate} a ${task.endDate}`
                      }
                    >
                      <span>{duration} {duration === 1 ? "día" : "días"}</span>
                    </button>
                    <button
                      className={`gantt-reschedule-handle is-start ${
                        activeDrag?.mode === "start" ? "is-dragging" : ""
                      }`}
                      type="button"
                      onPointerDown={(event) => startTaskDrag(event, task.id, "start")}
                      onPointerMove={(event) => moveTaskDrag(event, task.id)}
                      onPointerUp={(event) => endTaskDrag(event, task.id)}
                      onPointerCancel={cancelTaskDrag}
                      onClick={() => onExtendTask(task.id, "start")}
                      style={{ gridColumn: previewOffset + 1 }}
                      title={`Extender inicio de ${task.name} un día antes`}
                      aria-label={`Extender inicio de ${task.name} un día antes`}
                    >
                      ◀
                    </button>
                    <button
                      className={`gantt-reschedule-handle is-end ${
                        activeDrag?.mode === "end" ? "is-dragging" : ""
                      }`}
                      type="button"
                      onPointerDown={(event) => startTaskDrag(event, task.id, "end")}
                      onPointerMove={(event) => moveTaskDrag(event, task.id)}
                      onPointerUp={(event) => endTaskDrag(event, task.id)}
                      onPointerCancel={cancelTaskDrag}
                      onClick={() => onExtendTask(task.id, "end")}
                      style={{ gridColumn: previewOffset + previewDuration }}
                      title={`Extender final de ${task.name} un día después`}
                      aria-label={`Extender final de ${task.name} un día después`}
                    >
                      ▶
                    </button>
                    {task.delayRecords.map((record) => {
                      const markerOffset = dayDifference(
                        timeline.start,
                        parseDate(record.date),
                      );

                      return (
                        <button
                          className={`gantt-delay-marker ${
                            record.days < 0 ? "is-advance" : ""
                          }`}
                          type="button"
                          key={record.id}
                          onClick={() =>
                            onDeleteAdjustment(task.id, record.id)
                          }
                          style={{ gridColumn: markerOffset + 1 }}
                          title={`Eliminar ${
                            record.days > 0 ? "retraso" : "avance"
                          } de ${Math.abs(record.days)} días`}
                        >
                          <span>
                            {record.days > 0 ? "+" : ""}
                            {record.days}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="gantt-task-total"
                    type="button"
                    onClick={() => onTaskSelect(task.id)}
                    title={`Ir a ${task.name}`}
                  >
                    <span>Costo total</span>
                    <strong>{formatMoney(taskTotal)}</strong>
                  </button>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function App() {
  const [tasks, setTasks] = useState(() => [createTask(1)]);
  const [productionLines, setProductionLines] = useState(() => [
    createProductionLine(1, "Eficiencia de linea de producción"),
  ]);
  const [saveState, setSaveState] = useState("loading");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [highlightedTaskId, setHighlightedTaskId] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [pendingAdjustmentDeletion, setPendingAdjustmentDeletion] =
    useState(null);
  const highlightTimerRef = useRef(null);

  useEffect(() => {
    let active = true;

    loadProject()
      .then((savedProject) => {
        if (!active) return;

        if (savedProject?.tasks?.length) {
          const restoredProductionLines =
            Array.isArray(savedProject.productionLines) &&
            savedProject.productionLines.length
              ? savedProject.productionLines
              : [createProductionLine(1, "Eficiencia de linea de producción")];
          const restoredTasks = savedProject.tasks.map((task, index) => {
            const migratedActivities =
              Array.isArray(task.activities) && task.activities.length
                ? task.activities
                : task.description
                  ? task.description
                      .split(/\r?\n/)
                      .map((line) => line.replace(/^\s*[+•-]\s*/, "").trim())
                      .filter(Boolean)
                  : [""];

            return {
              ...createTask(index + 1),
              ...task,
              productionLineId:
                task.productionLineId ||
                restoredProductionLines[0]?.id ||
                DEFAULT_PRODUCTION_LINE_ID,
              activities: migratedActivities.length ? migratedActivities : [""],
              nonComplianceNotes:
                Array.isArray(task.nonComplianceNotes) &&
                task.nonComplianceNotes.length
                  ? task.nonComplianceNotes
                  : [""],
              delayRecords: Array.isArray(task.delayRecords)
                ? task.delayRecords
                : [],
              originalStartDate:
                task.originalStartDate || task.startDate || "",
              originalEndDate:
                task.originalEndDate ||
                task.delayRecords?.[0]?.previousEndDate ||
                task.endDate ||
                "",
              previewUrl: task.file ? URL.createObjectURL(task.file) : "",
              error: "",
            };
          });
          setProductionLines(restoredProductionLines);
          setTasks(restoredTasks);
          setLastSavedAt(savedProject.savedAt || "");
          setSaveState("saved");
        } else {
          setSaveState("unsaved");
        }
      })
      .catch(() => {
        if (active) setSaveState("error");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function warnBeforeLeaving(event) {
      if (saveState === "unsaved") {
        event.preventDefault();
        event.returnValue = "";
      }
    }

    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [saveState]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pendingAdjustmentDeletion) return undefined;

    function closeWithEscape(event) {
      if (event.key === "Escape") setPendingAdjustmentDeletion(null);
    }

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", closeWithEscape);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [pendingAdjustmentDeletion]);

  function updateTask(id, changes) {
    setSaveState("unsaved");
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== id) return task;

        const hasAdjustments = task.delayRecords.length > 0;
        return {
          ...task,
          ...changes,
          ...(!hasAdjustments && changes.startDate !== undefined
            ? { originalStartDate: changes.startDate }
            : {}),
          ...(!hasAdjustments && changes.endDate !== undefined
            ? { originalEndDate: changes.endDate }
            : {}),
        };
      }),
    );
  }

  function addTask() {
    setSaveState("unsaved");
    setTasks((currentTasks) => [
      ...currentTasks,
      {
        ...createTask(currentTasks.length + 1),
        productionLineId: productionLines[0]?.id || DEFAULT_PRODUCTION_LINE_ID,
      },
    ]);
  }

  function removeTask(id) {
    setSaveState("unsaved");
    setTasks((currentTasks) => {
      const taskToRemove = currentTasks.find((task) => task.id === id);
      if (taskToRemove?.previewUrl) URL.revokeObjectURL(taskToRemove.previewUrl);
      return currentTasks.filter((task) => task.id !== id);
    });
    setSelectedTaskIds((currentIds) =>
      currentIds.filter((selectedId) => selectedId !== id),
    );
  }

  function updateTaskSelection(taskId, checked) {
    setSelectedTaskIds((currentIds) => {
      if (checked) {
        return currentIds.includes(taskId) ? currentIds : [...currentIds, taskId];
      }

      return currentIds.filter((selectedId) => selectedId !== taskId);
    });
  }

  function selectLineTasks(taskIds) {
    setSelectedTaskIds((currentIds) => {
      const nextSelection = new Set(currentIds);
      taskIds.forEach((taskId) => nextSelection.add(taskId));
      return [...nextSelection];
    });
  }

  function clearTaskSelection() {
    setSelectedTaskIds([]);
  }

  function duplicateSelectedTasks() {
    if (!selectedTaskIds.length) return;

    const selectedTasks = new Set(selectedTaskIds);
    const duplicatedTasks = new Map();

    tasks.forEach((task, index) => {
      if (selectedTasks.has(task.id)) {
        duplicatedTasks.set(task.id, duplicateTask(task, tasks.length + index + 1));
      }
    });

    if (!duplicatedTasks.size) return;

    setSaveState("unsaved");
    setTasks((currentTasks) =>
      currentTasks.flatMap((task) =>
        duplicatedTasks.has(task.id)
          ? [task, duplicatedTasks.get(task.id)]
          : [task],
      ),
    );
    setSelectedTaskIds([...duplicatedTasks.values()].map((task) => task.id));
  }

  function deleteSelectedTasks() {
    if (!selectedTaskIds.length) return;

    const confirmed = window.confirm(
      `Se eliminarán ${selectedTaskIds.length} tareas seleccionadas. ¿Deseas continuar?`,
    );
    if (!confirmed) return;

    const selectedTasks = new Set(selectedTaskIds);
    setSaveState("unsaved");
    setTasks((currentTasks) => {
      currentTasks.forEach((task) => {
        if (selectedTasks.has(task.id) && task.previewUrl) {
          URL.revokeObjectURL(task.previewUrl);
        }
      });

      return currentTasks.filter((task) => !selectedTasks.has(task.id));
    });
    setSelectedTaskIds([]);
  }

  function assignSelectedTasksToLine(lineId) {
    if (!selectedTaskIds.length || !lineId) return;

    const selectedTasks = new Set(selectedTaskIds);
    setSaveState("unsaved");
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        selectedTasks.has(task.id)
          ? { ...task, productionLineId: lineId }
          : task,
      ),
    );
  }

  function deleteProductionLine(lineId) {
    const lineToDelete = productionLines.find((line) => line.id === lineId);
    if (!lineToDelete || productionLines.length <= 1) return;

    const tasksInLine = tasks.filter(
      (task) => (task.productionLineId || DEFAULT_PRODUCTION_LINE_ID) === lineId,
    );
    const confirmed = window.confirm(
      tasksInLine.length
        ? `Se eliminará la línea "${lineToDelete.name}" y ${tasksInLine.length} tareas asignadas. ¿Deseas continuar?`
        : `Se eliminará la línea "${lineToDelete.name}". ¿Deseas continuar?`,
    );
    if (!confirmed) return;

    const deletedTaskIds = new Set(tasksInLine.map((task) => task.id));
    setSaveState("unsaved");
    setProductionLines((currentLines) =>
      currentLines.filter((line) => line.id !== lineId),
    );
    setTasks((currentTasks) => {
      currentTasks.forEach((task) => {
        if (deletedTaskIds.has(task.id) && task.previewUrl) {
          URL.revokeObjectURL(task.previewUrl);
        }
      });

      return currentTasks.filter((task) => !deletedTaskIds.has(task.id));
    });
    setSelectedTaskIds((currentIds) =>
      currentIds.filter((taskId) => !deletedTaskIds.has(taskId)),
    );
  }

  function moveTaskWithinLine(id, direction) {
    setSaveState("unsaved");
    setTasks((currentTasks) => {
      const currentIndex = currentTasks.findIndex((task) => task.id === id);
      if (currentIndex === -1) return currentTasks;

      const currentTask = currentTasks[currentIndex];
      const lineTaskIndexes = currentTasks
        .map((task, taskIndex) => ({ task, taskIndex }))
        .filter(
          ({ task }) =>
            (task.productionLineId || DEFAULT_PRODUCTION_LINE_ID) ===
            (currentTask.productionLineId || DEFAULT_PRODUCTION_LINE_ID),
        )
        .map(({ taskIndex }) => taskIndex);
      const positionInLine = lineTaskIndexes.indexOf(currentIndex);
      const targetPositionInLine = positionInLine + direction;

      if (
        positionInLine === -1 ||
        targetPositionInLine < 0 ||
        targetPositionInLine >= lineTaskIndexes.length
      ) {
        return currentTasks;
      }

      const targetIndex = lineTaskIndexes[targetPositionInLine];
      const reorderedTasks = [...currentTasks];
      [reorderedTasks[currentIndex], reorderedTasks[targetIndex]] = [
        reorderedTasks[targetIndex],
        reorderedTasks[currentIndex],
      ];

      return reorderedTasks;
    });
  }

  function addProductionLine() {
    setSaveState("unsaved");
    setProductionLines((currentLines) => [
      ...currentLines,
      createProductionLine(currentLines.length + 1),
    ]);
  }

  function updateProductionLine(id, changes) {
    setSaveState("unsaved");
    setProductionLines((currentLines) =>
      currentLines.map((line) =>
        line.id === id ? { ...line, ...changes } : line,
      ),
    );
  }

  function registerDelay(taskId, { date, days }) {
    const adjustmentDays = Math.trunc(Number(days));
    if (!date || !Number.isFinite(adjustmentDays) || adjustmentDays === 0) return;

    setSaveState("unsaved");
    setTasks((currentTasks) => {
      const delayedTaskIndex = currentTasks.findIndex(
        (task) => task.id === taskId,
      );
      if (delayedTaskIndex === -1) return currentTasks;
      const adjustedTask = currentTasks[delayedTaskIndex];
      const adjustedLineId =
        adjustedTask.productionLineId || DEFAULT_PRODUCTION_LINE_ID;

      return currentTasks.map((task, taskIndex) => {
        if (taskIndex < delayedTaskIndex) return task;
        const taskLineId = task.productionLineId || DEFAULT_PRODUCTION_LINE_ID;
        if (taskLineId !== adjustedLineId) return task;

        if (taskIndex === delayedTaskIndex) {
          if (!task.endDate) return task;
          const normalizedEventDate = toDateInput(
            clampDateToRange(
              parseDate(date),
              task.startDate ? parseDate(task.startDate) : null,
              task.endDate ? parseDate(task.endDate) : null,
            ),
          );

          const newEndDate = toDateInput(
            addDays(parseDate(task.endDate), adjustmentDays),
          );
          if (
            task.startDate &&
            parseDate(newEndDate) < parseDate(task.startDate)
          ) {
            return task;
          }
          const record = {
            id: crypto.randomUUID(),
            date: normalizedEventDate,
            requestedDate: date,
            days: adjustmentDays,
            previousEndDate: task.endDate,
            newEndDate,
            createdAt: new Date().toISOString(),
          };

          return {
            ...task,
            endDate: newEndDate,
            delayRecords: [...task.delayRecords, record],
          };
        }

        return {
          ...task,
          startDate: task.startDate
            ? toDateInput(addDays(parseDate(task.startDate), adjustmentDays))
            : task.startDate,
          endDate: task.endDate
            ? toDateInput(addDays(parseDate(task.endDate), adjustmentDays))
            : task.endDate,
        };
      });
    });
  }

  function extendTaskFromGantt(taskId, edge) {
    setSaveState("unsaved");
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId || !task.startDate || !task.endDate) {
          return task;
        }

        const changes =
          edge === "start"
            ? {
                startDate: toDateInput(addDays(parseDate(task.startDate), -1)),
              }
            : {
                endDate: toDateInput(addDays(parseDate(task.endDate), 1)),
              };
        const hasAdjustments = task.delayRecords.length > 0;

        return {
          ...task,
          ...changes,
          ...(!hasAdjustments && changes.startDate !== undefined
            ? { originalStartDate: changes.startDate }
            : {}),
          ...(!hasAdjustments && changes.endDate !== undefined
            ? { originalEndDate: changes.endDate }
            : {}),
        };
      }),
    );
  }

  function moveTaskFromGantt(taskIds, deltaDays) {
    const movementDays = Math.trunc(Number(deltaDays));
    if (!Number.isFinite(movementDays) || movementDays === 0) return;
    const movedTaskIds = new Set(Array.isArray(taskIds) ? taskIds : [taskIds]);

    setSaveState("unsaved");
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (!movedTaskIds.has(task.id) || !task.startDate || !task.endDate) {
          return task;
        }

        const startDate = toDateInput(
          addDays(parseDate(task.startDate), movementDays),
        );
        const endDate = toDateInput(
          addDays(parseDate(task.endDate), movementDays),
        );
        const hasAdjustments = task.delayRecords.length > 0;

        return {
          ...task,
          startDate,
          endDate,
          ...(!hasAdjustments
            ? {
                originalStartDate: startDate,
                originalEndDate: endDate,
              }
            : {}),
        };
      }),
    );
  }

  function resizeTaskFromGantt(taskId, edge, deltaDays) {
    const resizeDays = Math.trunc(Number(deltaDays));
    if (!Number.isFinite(resizeDays) || resizeDays === 0) return;

    setSaveState("unsaved");
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId || !task.startDate || !task.endDate) {
          return task;
        }

        const currentStart = parseDate(task.startDate);
        const currentEnd = parseDate(task.endDate);
        let startDate = task.startDate;
        let endDate = task.endDate;

        if (edge === "start") {
          const nextStart = addDays(currentStart, resizeDays);
          startDate = toDateInput(nextStart > currentEnd ? currentEnd : nextStart);
        } else {
          const nextEnd = addDays(currentEnd, resizeDays);
          endDate = toDateInput(nextEnd < currentStart ? currentStart : nextEnd);
        }

        const hasAdjustments = task.delayRecords.length > 0;

        return {
          ...task,
          startDate,
          endDate,
          ...(!hasAdjustments && edge === "start"
            ? { originalStartDate: startDate }
            : {}),
          ...(!hasAdjustments && edge === "end"
            ? { originalEndDate: endDate }
            : {}),
        };
      }),
    );
  }

  function removeAdjustment(taskId, recordId) {
    setSaveState("unsaved");
    setTasks((currentTasks) => {
      const adjustedTaskIndex = currentTasks.findIndex(
        (task) => task.id === taskId,
      );
      if (adjustedTaskIndex === -1) return currentTasks;

      const record = currentTasks[adjustedTaskIndex].delayRecords.find(
        (item) => item.id === recordId,
      );
      if (!record) return currentTasks;

      const reverseDays = -record.days;
      const adjustedLineId =
        currentTasks[adjustedTaskIndex].productionLineId ||
        DEFAULT_PRODUCTION_LINE_ID;

      return currentTasks.map((task, taskIndex) => {
        if (taskIndex < adjustedTaskIndex) return task;
        const taskLineId = task.productionLineId || DEFAULT_PRODUCTION_LINE_ID;
        if (taskLineId !== adjustedLineId) return task;

        if (taskIndex === adjustedTaskIndex) {
          return {
            ...task,
            endDate: task.endDate
              ? toDateInput(addDays(parseDate(task.endDate), reverseDays))
              : task.endDate,
            delayRecords: task.delayRecords.filter(
              (item) => item.id !== recordId,
            ),
          };
        }

        return {
          ...task,
          startDate: task.startDate
            ? toDateInput(addDays(parseDate(task.startDate), reverseDays))
            : task.startDate,
          endDate: task.endDate
            ? toDateInput(addDays(parseDate(task.endDate), reverseDays))
            : task.endDate,
        };
      });
    });
  }

  function requestAdjustmentDeletion(taskId, recordId) {
    const task = tasks.find((item) => item.id === taskId);
    const record = task?.delayRecords.find((item) => item.id === recordId);
    if (!task || !record) return;

    setPendingAdjustmentDeletion({
      taskId,
      recordId,
      taskName: task.name,
      days: record.days,
      date: record.date,
    });
  }

  function confirmAdjustmentDeletion() {
    if (!pendingAdjustmentDeletion) return;

    removeAdjustment(
      pendingAdjustmentDeletion.taskId,
      pendingAdjustmentDeletion.recordId,
    );
    setPendingAdjustmentDeletion(null);
  }

  function goToTask(id) {
    const taskElement = document.getElementById(`task-${id}`);
    if (!taskElement) return;

    taskElement.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightedTaskId(id);

    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedTaskId("");
    }, 2200);
  }

  function goToEfficiencyLine(id) {
    const lineElement = document.getElementById(`line-${id}`);
    if (!lineElement) return;

    lineElement.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSave() {
    try {
      setSaveState("saving");
      const savedAt = await saveProject(tasks, productionLines);
      setLastSavedAt(savedAt);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  const saveStatusText = {
    loading: "Buscando avance guardado…",
    saving: "Guardando todas las tareas…",
    saved: lastSavedAt
      ? `Guardado ${new Intl.DateTimeFormat("es-MX", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(lastSavedAt))}`
      : "Avance guardado",
    unsaved: "Hay cambios sin guardar",
    error: "No fue posible guardar en este navegador",
  }[saveState];
  const groupedTasksByLine = productionLines.map((line) => ({
    ...line,
    tasks: tasks.filter(
      (task) =>
        (task.productionLineId || DEFAULT_PRODUCTION_LINE_ID) === line.id,
    ),
  }));

  return (
    <div className="app-shell">
      <QuickBrowser
        groupedTasksByLine={groupedTasksByLine}
        productionLines={productionLines}
        selectedTaskIds={selectedTaskIds}
        onTaskSelect={goToTask}
        onTaskSelectionChange={updateTaskSelection}
        onSelectLineTasks={selectLineTasks}
        onClearSelection={clearTaskSelection}
        onDuplicateSelected={duplicateSelectedTasks}
        onDeleteSelected={deleteSelectedTasks}
        onAssignSelectedToLine={assignSelectedTasksToLine}
        onDeleteLine={deleteProductionLine}
      />

      <header className="topbar">
        <a className="brand" href="#" aria-label="Inicio">
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}brand/aves-logo.png`}
            alt="AVES"
          />
          <span className="brand-divider" aria-hidden="true" />
          <span className="product-name">
            <strong>Control de Producción</strong>
            <small>Planeación constructiva</small>
          </span>
        </a>
        <div className="topbar-actions">
          <button
            className="save-button topbar-save-button"
            type="button"
            onClick={handleSave}
            disabled={saveState === "saving" || saveState === "loading"}
          >
            <span aria-hidden="true">▣</span>
            {saveState === "saving" ? "Guardando…" : "Guardar avance"}
          </button>
          <small className={`save-status topbar-save-status save-status-${saveState}`}>
            <span aria-hidden="true" />
            {saveStatusText}
          </small>
          <span className="stage-badge">Etapa 01 · Planeación de tareas</span>
        </div>
      </header>

      <main>
        <section className="hero hero-with-action">
          <div>
            <span className="eyebrow">Línea de producción</span>
            <h1>Construye el calendario tarea por tarea</h1>
            <p>
              Cada archivo representa una actividad con fechas y costos propios.
              Agrega tantas tareas como necesites.
            </p>
          </div>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={addTask}>
              <span>＋</span>
              Agregar nueva tarea
            </button>
            <button className="line-button" type="button" onClick={addProductionLine}>
              <span>＋</span>
              Crear línea de eficiencia
            </button>
          </div>
        </section>

        <ProductionEfficiencyMonitor
          tasks={tasks}
          productionLines={productionLines}
          onLineChange={updateProductionLine}
          onTaskSelect={goToTask}
        />

        <section className="tasks-list">
          {groupedTasksByLine.map((line) => (
            <section className="task-line-group" id={`tasks-line-${line.id}`} key={line.id}>
              <div className="task-line-group-heading">
                <span>Línea de eficiencia</span>
                <h2>{line.name}</h2>
                <small>
                  {line.tasks.length}{" "}
                  {line.tasks.length === 1 ? "tarea asignada" : "tareas asignadas"}
                </small>
              </div>

              <div className="task-line-group-list">
                {line.tasks.map((task, lineTaskIndex) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    index={tasks.findIndex((item) => item.id === task.id)}
                    productionLines={productionLines}
                    onChange={(changes) => updateTask(task.id, changes)}
                    onRemove={() => removeTask(task.id)}
                    onRegisterDelay={(delay) => registerDelay(task.id, delay)}
                    onRemoveAdjustment={(recordId) =>
                      requestAdjustmentDeletion(task.id, recordId)
                    }
                    onMoveUp={() => moveTaskWithinLine(task.id, -1)}
                    onMoveDown={() => moveTaskWithinLine(task.id, 1)}
                    canMoveUp={lineTaskIndex > 0}
                    canMoveDown={lineTaskIndex < line.tasks.length - 1}
                    isHighlighted={highlightedTaskId === task.id}
                  />
                ))}
              </div>
            </section>
          ))}
        </section>

        <div className="add-task-row">
          <button className="add-task-button" type="button" onClick={addTask}>
            <span>＋</span>
            Agregar otra tarea
          </button>
          <small>{tasks.length} {tasks.length === 1 ? "tarea creada" : "tareas creadas"} · sin límite</small>
        </div>

        <GanttChart
          tasks={tasks}
          productionLines={productionLines}
          onTaskSelect={goToTask}
          selectedTaskIds={selectedTaskIds}
          onTaskSelectionChange={updateTaskSelection}
          onDeleteAdjustment={requestAdjustmentDeletion}
          onExtendTask={extendTaskFromGantt}
          onMoveTask={moveTaskFromGantt}
          onResizeTask={resizeTaskFromGantt}
          onLineSelect={goToEfficiencyLine}
        />
      </main>

      {pendingAdjustmentDeletion && (
        <div
          className="confirmation-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingAdjustmentDeletion(null);
            }
          }}
        >
          <section
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adjustment-confirmation-title"
          >
            <div
              className={`confirmation-icon ${
                pendingAdjustmentDeletion.days < 0 ? "is-advance" : ""
              }`}
              aria-hidden="true"
            >
              !
            </div>
            <span className="confirmation-kicker">
              Confirmar eliminación
            </span>
            <h2 id="adjustment-confirmation-title">
              ¿Eliminar este{" "}
              {pendingAdjustmentDeletion.days > 0 ? "retraso" : "avance"}?
            </h2>
            <p>
              Se eliminará el ajuste de{" "}
              <strong>{Math.abs(pendingAdjustmentDeletion.days)} días</strong>{" "}
              en <strong>{pendingAdjustmentDeletion.taskName}</strong>. Las
              fechas de esta tarea y las posteriores serán recalculadas.
            </p>
            <div className="confirmation-summary">
              <span>
                {pendingAdjustmentDeletion.days > 0 ? "Retraso" : "Avance"}
              </span>
              <strong>
                {pendingAdjustmentDeletion.days > 0 ? "+" : ""}
                {pendingAdjustmentDeletion.days} días
              </strong>
              <small>
                Fecha registrada:{" "}
                {new Intl.DateTimeFormat("es-MX", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }).format(parseDate(pendingAdjustmentDeletion.date))}
              </small>
            </div>
            <div className="confirmation-actions">
              <button
                className="cancel-confirmation-button"
                type="button"
                onClick={() => setPendingAdjustmentDeletion(null)}
                autoFocus
              >
                Cancelar
              </button>
              <button
                className="delete-confirmation-button"
                type="button"
                onClick={confirmAdjustmentDeletion}
              >
                Sí, eliminar ajuste
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
