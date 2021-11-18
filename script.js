"use strict";

const DEFAULT_CANVAS_ROW_COUNT = 32;
const DEFAULT_CANVAS_COLUMN_COUNT = 32;
const MIN_CANVAS_ROW_COUNT = 16;
const MIN_CANVAS_COLUMN_COUNT = 16;
const MAX_CANVAS_ROW_COUNT = 128;
const MAX_CANVAS_COLUMN_COUNT = 128;

const COLOR_NONE = [0x0, 0x0, 0x0, 0];
const PIXEL_HIGHLIGHT_DURATION = 200;
const PIXEL_HIGHLIGHT_COLOR = [0x0, 0x0, 0x0];
const DEFAULT_BRUSH_COLOR = [0x0, 0x0, 0x0];
const DEFAULT_BRUSH_OPACITY = 0.1;
const DEFAULT_BRUSH_OPACITY_RANGE = [0, 1, 0.01];
const DEFAULT_SOLID_BACKGROUND = [0xff, 0xff, 0xff];

const CANVAS_SHADER_FPS = 32;

const LAYER_INDEX_BACKGROUND = 0;
const LAYER_INDEX_BRUSH = 1;
const LAYER_INDEX_HIGHLIGHT = 2;

const SVG_EXPORT_DIMENSIONS = [256, 256];
const SVG_EXPORT_DEFAULT_FILENAME = "sketch.svg";

//

class GridCanvas extends HTMLElement {
  #pixelMatrix;
  #rows;
  #columns;
  #pixels;

  constructor(rows, columns, r, g, b, a) {
    super();

    this.#pixelMatrix = [];
    this.#rows = rows;
    this.#columns = columns;
    this.#pixels = rows * columns;
    this.style.touchAction = "none";
    this.style.display = "grid";
    this.style.gridTemplateRows = `repeat(${rows}, ${100 / rows}%)`;
    this.style.gridTemplateColumns = `repeat(${columns}, ${100 / columns}%)`;
    this.oncontextmenu = (e) => false;

    for (let i = 0; i < rows; ++i) {
      const pixelRow = [];

      for (let j = 0; j < columns; ++j) {
        const defaultColor = defaultPixelColor(i, j, rows, columns);
        const pixel = new GridPixel(
          r ?? defaultColor[0],
          g ?? defaultColor[1],
          b ?? defaultColor[2],
          a ?? defaultColor[3]
        );

        Object.defineProperty(pixel, "rowIndex", {
          value: i,
          writable: false,
        });
        Object.defineProperty(pixel, "columnIndex", {
          value: j,
          writable: false,
        });
        Object.defineProperty(pixel, "gridCanvas", {
          value: this,
          writable: false,
        });

        pixel.classList.add(`grid-item-${i}-${j}`);
        pixel.style.gridColumnStart = `${j + 1}`;
        pixel.style.gridColumnEnd = `${j + 2}`;
        pixel.style.gridRowStart = `${i + 1}`;
        pixel.style.gridRowEnd = `${i + 2}`;

        this.appendChild(pixel);
        pixelRow.push(pixel);
      }

      this.#pixelMatrix.push(pixelRow);
    }
  }

  get rowCount() {
    return this.#rows;
  }
  get columnCount() {
    return this.#columns;
  }
  get pixelCount() {
    return this.#pixels;
  }

  getPixel(i, j) {
    return this.#pixelMatrix[i][j];
  }
  getPixelByCoord(x, y) {
    const i = Math.ceil(clamp(x, 0, 1) * this.rowCount);
    const j = Math.ceil(clamp(y, 0, 1) * this.columnCount);
    return this.getPixel(i, j);
  }

  getPixelsInBetween(pixelA, pixelB) {
    const ai = pixelA.rowIndex;
    const aj = pixelA.columnIndex;
    const bi = pixelB.rowIndex;
    const bj = pixelB.columnIndex;
    const deltaI = bi - ai;
    const deltaJ = bj - aj;
    const deltaIAbs = Math.abs(deltaI);
    const deltaJAbs = Math.abs(deltaJ);
    const slope = deltaJ / deltaI;

    const pixels = [];

    if (deltaIAbs > 1 || deltaJAbs > 1) {
      if (deltaIAbs > deltaJAbs) {
        const sign = deltaIAbs / deltaI;
        for (let i = 1; i < deltaIAbs; ++i) {
          const rowIndex = ai + sign * i;
          const colIndex = aj + sign * Math.round(i * slope);
          const pixel = this.getPixel(rowIndex, colIndex);
          pixels.push(pixel);
        }
      } else {
        const sign = deltaJAbs / deltaJ;
        for (let j = 1; j < deltaJAbs; ++j) {
          const rowIndex = ai + sign * Math.round(j / slope);
          const colIndex = aj + sign * j;
          const pixel = this.getPixel(rowIndex, colIndex);
          pixels.push(pixel);
        }
      }
    }

    return pixels;
  }

  traversePixels(onTraverse, ...callbackArgs) {
    for (let i = 0; i < this.rowCount; ++i) {
      for (let j = 0; j < this.columnCount; ++j) {
        if (onTraverse(this.getPixel(i, j), ...callbackArgs) === true) return;
      }
    }
  }

  setLayerColor(layerIndex, r, g, b, a) {
    this.traversePixels((pixel) => {
      const prevIndex = pixel.switchLayer(layerIndex);
      pixel.color = [r, g, b, a];
      pixel.switchLayer(prevIndex);
    });
  }

  mapPixelsTo(canvas) {
    const rows = canvas.rowCount;
    const columns = canvas.columnCount;

    const rowScale = rows / this.rowCount;
    const columnScale = columns / this.columnCount;

    canvas.traversePixels((pixel) => {
      const i = pixel.rowIndex;
      const j = pixel.columnIndex;

      const refPixel = this.getPixel(
        Math.floor(i / rowScale),
        Math.floor(j / columnScale)
      );

      let prevIndex;
      let layerIndex = 0;
      refPixel.traverseLayers((layer) => {
        try {
          prevIndex = pixel.switchLayer(layerIndex);
        } catch (error) {
          pixel.pushLayer();
        } finally {
          pixel.color = layer.color;
          pixel.switchLayer(prevIndex);
        }
        ++layerIndex;
      });
    });
  }

  reset() {
    this.traversePixels((pixel) => pixel.clearLayers());
  }

  exportAsSVG(width, height) {
    const dx = width / this.columnCount;
    const dy = height / this.rowCount;
    const canvasSvg = SVG();

    canvasSvg.size(width, height);

    this.traversePixels((pixel) => {
      const color = colorToHexStr(...pixel.computedColor);
      canvasSvg
        .rect(dx, dy)
        .fill(color)
        .stroke({ color, opacity: 1, width: 0.5 })
        .move(pixel.columnIndex * dx, pixel.rowIndex * dy);
    });

    return canvasSvg.svg();
  }
}

class GridPixel extends HTMLElement {
  #colorRed;
  #colorGreen;
  #colorBlue;
  #colorAlpha;
  #colorLayers;
  #currentLayerIndex;

  static Layer = class {
    #colorRed;
    #colorGreen;
    #colorBlue;
    #colorAlpha;

    constructor(r = 0xff, g = 0xff, b = 0xff, a = 1) {
      this.setColor(r, g, b, a);
    }

    setColor(r, g, b, a) {
      this.red = r;
      this.green = g;
      this.blue = b;
      this.alpha = a;
    }

    get red() {
      return this.#colorRed;
    }
    set red(value) {
      this.#colorRed = value == null ? this.#colorRed : clampColor(value);
    }

    get green() {
      return this.#colorGreen;
    }
    set green(value) {
      this.#colorGreen = value == null ? this.#colorGreen : clampColor(value);
    }

    get blue() {
      return this.#colorBlue;
    }
    set blue(value) {
      this.#colorBlue = value == null ? this.#colorBlue : clampColor(value);
    }

    get alpha() {
      return this.#colorAlpha;
    }
    set alpha(value) {
      this.#colorAlpha = value == null ? this.#colorAlpha : clamp(value);
    }

    get color() {
      return [this.red, this.green, this.blue, this.alpha];
    }
    set color(rgba) {
      this.setColor(...rgba);
    }

    merge(overlayLayer) {
      const overlayOpacity = 1 - overlayLayer.alpha;
      this.#colorAlpha = overlayLayer.alpha + this.alpha * overlayOpacity;
      this.#colorRed =
        (overlayLayer.red * overlayLayer.alpha +
          this.red * this.alpha * overlayOpacity) /
        this.alpha;
      this.#colorGreen =
        (overlayLayer.green * overlayLayer.alpha +
          this.green * this.alpha * overlayOpacity) /
        this.alpha;
      this.#colorBlue =
        (overlayLayer.blue * overlayLayer.alpha +
          this.blue * this.alpha * overlayOpacity) /
        this.alpha;
    }
  };

  static #layerMerger = new GridPixel.Layer();

  constructor(r = 0xff, g = 0xff, b = 0xff, a = 1) {
    super();

    this.style.display = "block";
    this.classList.add("pixel");
    this.#colorLayers = [new GridPixel.Layer(r, g, b, a)];
    this.#currentLayerIndex = 0;
    this.oncontextmenu = (e) => false;

    this.updateColor();
  }

  updateColor() {
    const merger = GridPixel.#layerMerger;
    merger.color = this.#colorLayers[0].color;

    for (let i = 1; i < this.#colorLayers.length; ++i) {
      merger.merge(this.#colorLayers[i]);
    }

    const r = clampColor(merger.red);
    const g = clampColor(merger.green);
    const b = clampColor(merger.blue);
    const a = clampColor(merger.alpha);

    this.#colorRed = r;
    this.#colorGreen = g;
    this.#colorBlue = b;
    this.#colorAlpha = a;

    this.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  get layerCount() {
    return this.#colorLayers.length;
  }

  get currentLayer() {
    return this.#colorLayers[this.#currentLayerIndex];
  }
  switchLayer(i) {
    if (i == null || i < 0 || i >= this.#colorLayers.length) {
      throw new Error("Index out of range!");
    }

    const prevIndex = this.#currentLayerIndex;
    this.#currentLayerIndex = i;
    return prevIndex;
  }

  get bottomLayer() {
    return this.#colorLayers[0];
  }
  get topLayer() {
    return this.#colorLayers[this.#colorLayers.length - 1];
  }

  get computedRed() {
    return this.#colorRed;
  }
  get red() {
    return this.currentLayer.red;
  }
  set red(value) {
    if (value == null) return;

    this.currentLayer.red = value;
    this.updateColor();
  }

  get computedGreen() {
    return this.#colorGreen;
  }
  get green() {
    return this.currentLayer.green;
  }
  set green(value) {
    if (value == null) return;

    this.currentLayer.green = value;
    this.updateColor();
  }

  get computedBlue() {
    return this.#colorBlue;
  }
  get blue() {
    return this.currentLayer.blue;
  }
  set blue(value) {
    if (value == null) return;

    this.currentLayer.blue = value;
    this.updateColor();
  }

  get computedAlpha() {
    return this.#colorAlpha;
  }
  get alpha() {
    return this.currentLayer.alpha;
  }
  set alpha(value) {
    if (value == null) return;

    this.currentLayer.alpha = value;
    this.updateColor();
  }

  get computedColor() {
    return [
      this.computedRed,
      this.computedGreen,
      this.computedBlue,
      this.computedAlpha,
    ];
  }
  get color() {
    return [this.red, this.green, this.blue, this.alpha];
  }
  set color(rgba) {
    this.currentLayer.color = rgba;
    this.updateColor();
  }

  setColor(r, g, b, a) {
    this.currentLayer.setColor(r, g, b, a);
    this.updateColor();
  }

  pushLayer(setAsCurrent = true) {
    const newLayer = new GridPixel.Layer(0x0, 0x0, 0x0, 0);
    this.#colorLayers.splice(this.#currentLayerIndex + 1, 0, newLayer);

    if (setAsCurrent) ++this.#currentLayerIndex;

    return newLayer;
  }
  popLayer() {
    if (this.#currentLayerIndex === 0) return;

    const popped = this.#colorLayers.splice(this.#currentLayerIndex, 1)[0];
    this.updateColor();

    if (this.#currentLayerIndex === this.#colorLayers.length - 1) {
      --this.#currentLayerIndex;
    }
    return popped;
  }
  clearLayers() {
    if (this.#colorLayers.length < 1) return;
    this.#colorLayers.splice(1);
    this.#currentLayerIndex = 0;
    this.updateColor();
  }

  traverseLayers(onTraverse, topDown = false, ...callbackArgs) {
    if (topDown) {
      for (let i = this.#colorLayers.length - 1; i >= 0; --i) {
        if (onTraverse(this.#colorLayers[i], ...callbackArgs) === true) return;
      }
    } else {
      for (let i = 0; i < this.#colorLayers.length; ++i) {
        if (onTraverse(this.#colorLayers[i], ...callbackArgs) === true) return;
      }
    }
  }
}

class PointerState {
  static Button = {
    LEFT_MOUSE: 0,
    MIDDLE_MOUSE: 1,
    RIGHT_MOUSE: 2,
    PEN_CONTACT: 0,
    PEN_BARREL: 2,
    PEN_ERASER: 5,
    TOUCH_CONTACT: 0,
  };

  static PointerType = {
    MOUSE: "mouse",
    PEN: "pen",
    TOUCH: "touch",
  };

  #leftMouseFlag;
  #middleMouseFlag;
  #rightMouseFlag;
  #penContactFlag;
  #penBarrelFlag;
  #penEraserFlag;
  #touchFlag;
  #primaryStateChangeListeners;
  #middleStateChangeListeners;
  #auxiliaryStateChangeListeners;
  #movementListeners;
  #context;

  #updatePointerState(e, state) {
    switch (e.pointerType) {
      case PointerState.PointerType.MOUSE:
        switch (e.button) {
          case PointerState.Button.LEFT_MOUSE:
            this.#leftMouseFlag = state;
            break;

          case PointerState.Button.MIDDLE_MOUSE:
            this.#middleMouseFlag = state;
            break;

          case PointerState.Button.RIGHT_MOUSE:
            this.#rightMouseFlag = state;
            break;
        }
        break;

      case PointerState.PointerType.PEN:
        switch (e.button) {
          case PointerState.Button.PEN_CONTACT:
            this.#penContactFlag = state;
            break;

          case PointerState.Button.PEN_BARREL:
            this.#penBarrelFlag = state;
            break;

          case PointerState.Button.PEN_ERASER:
            this.#penEraserFlag = state;
            break;
        }
        break;

      case PointerState.PointerType.TOUCH:
        this.#touchFlag = state;
        break;
    }
  }

  #onPointerStateChange(e, down) {
    const prevPrimaryPressed = this.primaryPressed;
    const prevMiddlePressed = this.middlePressed;
    const prevAuxiliaryPressed = this.auxiliaryPressed;

    this.#updatePointerState(e, down);

    const listenerKey = down ? "onDown" : "onUp";

    if (this.primaryPressed !== prevPrimaryPressed) {
      this.#primaryStateChangeListeners.forEach((handler) => {
        handler[listenerKey].call(this.#context, e);
      });
    }
    if (this.middlePressed !== prevMiddlePressed) {
      this.#middleStateChangeListeners.forEach((handler) => {
        handler[listenerKey].call(this.#context, e);
      });
    }
    if (this.auxiliaryPressed !== prevAuxiliaryPressed) {
      this.#auxiliaryStateChangeListeners.forEach((handler) => {
        handler[listenerKey].call(this.#context, e);
      });
    }
  }

  #onPointerMove(e) {
    this.#movementListeners.forEach((listener) => listener.call(this, e));
  }

  constructor(context) {
    this.#context = context;

    this.#primaryStateChangeListeners = [];
    this.#middleStateChangeListeners = [];
    this.#auxiliaryStateChangeListeners = [];
    this.#movementListeners = [];

    context.addEventListener("pointerdown", (e) => {
      this.#onPointerStateChange(e, true);
    });
    context.addEventListener("pointerup", (e) => {
      this.#onPointerStateChange(e, false);
    });
    context.addEventListener("pointermove", (e) => {
      this.#onPointerMove(e);
    });
    context.ondragstart = () => false;
  }

  get context() {
    return this.#context;
  }

  get primaryPressed() {
    return this.#leftMouseFlag || this.#penContactFlag || this.#touchFlag;
  }
  get middlePressed() {
    return this.#middleMouseFlag;
  }
  get auxiliaryPressed() {
    return this.#rightMouseFlag || this.#penBarrelFlag || this.#penEraserFlag;
  }

  addPrimaryStateListener(onDown, onUp) {
    this.#primaryStateChangeListeners.push({ onDown, onUp });
  }
  addMiddleStateListener(onDown, onUp) {
    this.#middleStateChangeListeners.push({ onDown, onUp });
  }
  addAuxiliaryStateListener(onDown, onUp) {
    this.#auxiliaryStateChangeListeners.push({ onDown, onUp });
  }
  addMovementListener(onMove) {
    this.#movementListeners.push(onMove);
  }
}

// Main procedure

const mainContainer = document.querySelector(
  "#main-container .canvas-container"
);
const canvasClearButton = document.querySelector("#clear-button");
const canvasResizeButton = document.querySelector("#resize-button");
const canvasSaveButton = document.querySelector("#save-button");
const playPauseButton = document.querySelector("#play-pause-button");
const cursorVisibilitySwitch = document.querySelector(
  "#cursor-visibility-switch"
);
const solidBackgroundSwitch = document.querySelector(
  "#solid-background-switch"
);
const solidBackgroundPicker = document.querySelector(
  "#solid-background-picker"
);
const brushOpacityRange = document.querySelector("#brush-opacity-range");
const brushColorPicker = document.querySelector("#brush-color-picker");
const brushOpacityDisplay = document.querySelector("#brush-opacity-data");
const brushColorDisplay = document.querySelector("#brush-color-data");
const rowCountInput = document.querySelector(".rows-input");
const columnCountInput = document.querySelector(".columns-input");
const modalForm = document.querySelector(".modal");
const modalboxResizeButton = document.querySelector(".modalbox .resize-button");

const pointerState = new PointerState(document);

window.customElements.define("grid-canvas", GridCanvas);
window.customElements.define("grid-pixel", GridPixel);

let isPeriodicActionsPaused = false;
let time = 0;
let gridCanvas;
let intervalId;
let selectedPixel = undefined;
let brushColor = DEFAULT_BRUSH_COLOR;
let brushOpacity = DEFAULT_BRUSH_OPACITY;
let solidBackgroundColor = DEFAULT_SOLID_BACKGROUND;

brushOpacityRange.setAttribute("min", DEFAULT_BRUSH_OPACITY_RANGE[0]);
brushOpacityRange.setAttribute("max", DEFAULT_BRUSH_OPACITY_RANGE[1]);
brushOpacityRange.setAttribute("step", DEFAULT_BRUSH_OPACITY_RANGE[2]);

rowCountInput.value = DEFAULT_CANVAS_ROW_COUNT;
columnCountInput.value = DEFAULT_CANVAS_COLUMN_COUNT;
brushColorPicker.value = colorToHexStr(...DEFAULT_BRUSH_COLOR);
brushOpacityRange.value = DEFAULT_BRUSH_OPACITY;
brushColorDisplay.innerText = brushColorPicker.value.toString();
brushOpacityDisplay.innerText = brushOpacityRange.value.toString();
solidBackgroundPicker.value = colorToHexStr(...DEFAULT_SOLID_BACKGROUND);

window.addEventListener("click", onWindowClick);
document.addEventListener("visibilitychange", onDocumentVisibilityChange);
mainContainer.addEventListener("pointerleave", onMainContainerPointerLeave);
canvasClearButton.addEventListener("click", onCanvasClearButtonClick);
canvasResizeButton.addEventListener("click", onCanvasResizeButtonClick);
canvasSaveButton.addEventListener("click", onCanvasSaveButtonClick);
playPauseButton.addEventListener("click", onPlayPauseButtonClick);
cursorVisibilitySwitch.addEventListener(
  "change",
  onCursorVisibilitySwitchChange
);
solidBackgroundSwitch.addEventListener("change", onSolidBackgroundSwitchChange);
solidBackgroundPicker.addEventListener("input", onSolidBackgroundPickerChange);
modalboxResizeButton.addEventListener("click", onModalboxResizeButtonClick);
brushColorPicker.addEventListener("input", onBrushColorPickerChange);
brushOpacityRange.addEventListener("input", onBrushOpacityRangeChange);
rowCountInput.addEventListener("change", onRowCountInputChange);
columnCountInput.addEventListener("change", onColumnCountInputChange);

pointerState.addPrimaryStateListener(onPointerDown, onPointerUp);

gridCanvas = createGridCanvas();
onCursorVisibilitySwitchChange();
intervalId = initPeriodicActions(CANVAS_SHADER_FPS);

// Helper functions

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function clampColor(value) {
  return clamp(value, 0, 0xff);
}

function colorToHexStr(r, g, b) {
  r = Math.floor(r).toString(16);
  if (r.length == 1) r = `0${r}`;
  g = Math.floor(g).toString(16);
  if (g.length == 1) g = `0${g}`;
  b = Math.floor(b).toString(16);
  if (b.length == 1) b = `0${b}`;
  return `#${r}${g}${b}`;
}

function hexStrToColor(hexcolor) {
  const rgbHex = hexcolor.substr(1).match(/.{1,2}/g);
  return [
    parseInt(rgbHex[0], 16),
    parseInt(rgbHex[1], 16),
    parseInt(rgbHex[2], 16),
  ];
}

function colorEquals(c1, c2) {
  return c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

//

function defaultPixelColor(i, j, rows, columns) {
  const pixels = rows * columns;
  return [0x0, 0x0, 0x0, 1];
}

function createGridCanvas() {
  const rows = rowCountInput.value;
  const columns = columnCountInput.value;
  const canvas = new GridCanvas(rows, columns);
  canvas.traversePixels(onGridPixelInit);
  canvas.addEventListener("pointermove", onGridCanvasPointerMove);

  if (gridCanvas != null) mainContainer.removeChild(gridCanvas);

  mainContainer.appendChild(canvas);

  if (gridCanvas == null) {
    if (solidBackgroundSwitch.checked) {
      canvas.setLayerColor(LAYER_INDEX_BACKGROUND, ...solidBackgroundColor, 1);
    } else {
      canvas.traversePixels(onPixelPeriod, time);
    }
  } else {
    gridCanvas.mapPixelsTo(canvas);
  }

  return canvas;
}

let preview;
function initPeriodicActions(fps) {
  gridCanvas.traversePixels(onPixelPeriod, time);
  return setInterval(() => {
    if (!isPeriodicActionsPaused) {
      time += 1 / fps;
      gridCanvas.traversePixels(onPixelPeriod, time);
    }
  }, 1000 / fps);
}

// Event handlers & Callback functions

function onPixelLayersInit(pixel) {
  pixel.pushLayer();
  pixel.color = COLOR_NONE;
  pixel.pushLayer();
  pixel.color = COLOR_NONE;
}

function onPixelPointerOver(e) {
  if (
    e.pointerType === PointerState.PointerType.TOUCH &&
    selectedPixel != null
  ) {
    onPixelPointerOut.call(selectedPixel, e);
  }

  const prevIndex = this.switchLayer(LAYER_INDEX_HIGHLIGHT);
  this.color = [...brushColor, 1];
  this.switchLayer(prevIndex);

  if (!pointerState.primaryPressed) return;

  if (selectedPixel != null) {
    const skippedPixels = gridCanvas.getPixelsInBetween(selectedPixel, this);

    skippedPixels.forEach((pixel) => {
      const prevIndex = pixel.switchLayer(LAYER_INDEX_BRUSH);
      if (colorEquals(pixel.color, brushColor)) {
        pixel.color = [...brushColor, pixel.alpha + brushOpacity];
      } else {
        pixel.currentLayer.merge(
          new GridPixel.Layer(...brushColor, brushOpacity)
        );
        pixel.updateColor();
      }
      pixel.switchLayer(prevIndex);
    });
  }

  selectedPixel = this;
}

async function onPixelPointerOut(e) {
  if (!pointerState.primaryPressed) {
    const prevIndex = this.switchLayer(LAYER_INDEX_HIGHLIGHT);
    this.color = COLOR_NONE;
    this.switchLayer(prevIndex);
    return;
  }

  let prevIndex = this.switchLayer(LAYER_INDEX_BRUSH);
  if (colorEquals(this.color, brushColor)) {
    this.color = [...brushColor, this.alpha + brushOpacity];
  } else {
    this.currentLayer.merge(new GridPixel.Layer(...brushColor, brushOpacity));
    this.updateColor();
  }
  this.switchLayer(prevIndex);

  await sleep(PIXEL_HIGHLIGHT_DURATION);

  prevIndex = this.switchLayer(LAYER_INDEX_HIGHLIGHT);
  this.color = COLOR_NONE;
  this.switchLayer(prevIndex);
}

function onGridCanvasPointerMove(e) {
  const pixel = document.elementFromPoint(
    e.pageX - window.scrollX,
    e.pageY - window.scrollY
  );

  if (pixel instanceof GridPixel) {
    if (pixel !== selectedPixel) {
      onPixelPointerOver.call(pixel, e);
    }
  }
}

function onWindowClick(e) {
  if (e.target == modalForm) modalForm.style.display = "none";
}

function onDocumentVisibilityChange() {
  if (!solidBackgroundSwitch.checked) {
    if (document.visibilityState === "hidden") {
      clearInterval(intervalId);
    } else {
      intervalId = initPeriodicActions(CANVAS_SHADER_FPS);
    }
  }
}

function onMainContainerPointerLeave(e) {
  if (e.target === mainContainer) selectedPixel = undefined;
}

function onCanvasClearButtonClick(e) {
  gridCanvas.reset();
  gridCanvas.traversePixels((pixel) => onPixelLayersInit(pixel));
}

function onCanvasResizeButtonClick(e) {
  modalForm.style.display = "flex";
}

function onCanvasSaveButtonClick(e) {
  const svgString = gridCanvas.exportAsSVG(...SVG_EXPORT_DIMENSIONS);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  saveAs(blob, SVG_EXPORT_DEFAULT_FILENAME);
}

function onPlayPauseButtonClick(e) {
  isPeriodicActionsPaused = !isPeriodicActionsPaused;
}

function onCursorVisibilitySwitchChange(e) {
  if (cursorVisibilitySwitch.checked) {
    gridCanvas.classList.remove("hide-cursor");
  } else {
    gridCanvas.classList.add("hide-cursor");
  }
}

function onSolidBackgroundSwitchChange(e) {
  if (solidBackgroundSwitch.checked) {
    clearInterval(intervalId);
    gridCanvas.setLayerColor(
      LAYER_INDEX_BACKGROUND,
      ...solidBackgroundColor,
      1
    );
  } else {
    intervalId = initPeriodicActions(CANVAS_SHADER_FPS);
  }
}

function onSolidBackgroundPickerChange(e) {
  solidBackgroundColor = hexStrToColor(this.value);
  if (solidBackgroundSwitch.checked) {
    gridCanvas.setLayerColor(
      LAYER_INDEX_BACKGROUND,
      ...solidBackgroundColor,
      1
    );
  }
}

function onModalboxResizeButtonClick(e) {
  modalForm.style.display = "none";
  gridCanvas = createGridCanvas();
  onCursorVisibilitySwitchChange();
}

function onBrushColorPickerChange(e) {
  brushColor = hexStrToColor(this.value);
  brushColorDisplay.innerText = this.value;
}

function onBrushOpacityRangeChange(e) {
  brushOpacity = parseFloat(this.value);
  brushOpacityDisplay.innerText = this.value;
}

function onRowCountInputChange(e) {
  rowCountInput.value = clamp(
    parseInt(rowCountInput.value),
    MIN_CANVAS_ROW_COUNT,
    MAX_CANVAS_ROW_COUNT
  );
}

function onColumnCountInputChange(e) {
  columnCountInput.value = clamp(
    parseInt(columnCountInput.value),
    MIN_CANVAS_COLUMN_COUNT,
    MAX_CANVAS_COLUMN_COUNT
  );
}

function onPointerDown(e) {}

function onPointerUp(e) {
  if (selectedPixel) {
    const prevIndex = selectedPixel.switchLayer(LAYER_INDEX_BRUSH);
    if (colorEquals(selectedPixel.color, brushColor)) {
      selectedPixel.color = [...brushColor, selectedPixel.alpha + brushOpacity];
    } else {
      selectedPixel.currentLayer.merge(
        new GridPixel.Layer(...brushColor, brushOpacity)
      );
      selectedPixel.updateColor();
    }
    selectedPixel.switchLayer(prevIndex);

    if (e.pointerType === PointerState.PointerType.TOUCH) {
      const prevIndex = selectedPixel.switchLayer(LAYER_INDEX_HIGHLIGHT);
      selectedPixel.color = COLOR_NONE;
      selectedPixel.switchLayer(prevIndex);
    }
  }
  selectedPixel = undefined;
}

function onGridPixelInit(pixel) {
  Object.defineProperty(pixel, "pointerState", {
    value: new PointerState(pixel),
    writable: false,
  });

  pixel.addEventListener("pointerout", (e) => {
    if (e.pointerType !== PointerState.PointerType.TOUCH) {
      onPixelPointerOut.call(pixel, e);
    }
  });
  pixel.pointerState.addPrimaryStateListener(
    (e) => {
      selectedPixel = pixel;
    },
    (e) => {}
  );

  onPixelLayersInit(pixel);
}

function onPixelPeriod(pixel, time) {
  const canvas = pixel.gridCanvas;
  const aspectRatio = canvas.offsetWidth / canvas.offsetHeight;
  const x = pixel.columnIndex / canvas.columnCount;
  const y = pixel.rowIndex / canvas.rowCount;

  const color = onShaderPeriod(x * aspectRatio, y, aspectRatio, 1, time);

  const prevIndex = pixel.switchLayer(LAYER_INDEX_BACKGROUND);
  pixel.color = color;
  pixel.switchLayer(prevIndex);
}

function onShaderPeriod(x, y, maxX, maxY, time) {
  // Shader pattern copied from https://www.shadertoy.com/view/NdKXzw then
  // translated to JavaScript.

  function length(vx, vy) {
    return Math.sqrt(vx * vx + vy * vy);
  }
  function mix(lo, hi, value) {
    return lo * (1 - value) + hi * a;
  }
  function smoothstep(lo, hi, value) {
    let t = clamp((value - lo) / (hi - lo), 0, 1);
    return t * t * (3 - 2 * t);
  }

  const MIN_DIAM = 0.5;
  const MAX_DIAM = 0.8;

  let uvx = x - 0.5 * maxX;
  let uvy = y - 0.5 * maxY;
  const a = Math.PI / 4;
  const c = Math.cos(a);
  const s = Math.sin(a);

  const mat = [c, -s, s, c];
  const nuvx = mat[0] * uvx + mat[2] * uvy;
  const nuvy = mat[1] * uvx + mat[3] * uvy;
  uvx = 8 * nuvx;
  uvy = 8 * nuvy;

  const gvx = uvx % 1;
  const gvy = uvy % 1;
  const idx = Math.floor(uvx);
  const idy = Math.floor(uvy);
  let m = 0;

  const nd = 1;

  for (let i = -nd; i <= nd; ++i) {
    for (let j = -nd; j <= nd; ++j) {
      const d = length(gvx - i, gvy - j);
      const dist = length(idx + i, idy + j);
      const truc = Math.sin(dist - 7 * time) * 0.5 + 0.5;

      let rx = mix(MIN_DIAM, MAX_DIAM, truc);
      let ry = rx - 0.00009;

      m += smoothstep(rx, ry, d) * 0.3;
    }
  }

  // return rgba as array
  return [0xff * (m + 0.4), 0xff * (m * 0.6 + 0.6), 0xff * (m * 0.5 + 0.4), 1];
}
