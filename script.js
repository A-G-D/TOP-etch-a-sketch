'use strict';

const DEFAULT_CANVAS_ROW_COUNT          = 64;
const DEFAULT_CANVAS_COLUMN_COUNT       = 64;
const MIN_CANVAS_ROW_COUNT              = 16;
const MIN_CANVAS_COLUMN_COUNT           = 16;
const MAX_CANVAS_ROW_COUNT              = 128;
const MAX_CANVAS_COLUMN_COUNT           = 128;

const GRID_CANVAS_WIDTH                 = 480;
const GRID_CANVAS_HEIGHT                = 480;

const COLOR_NULL                        = [0x0, 0x0, 0x0, 0];
const PIXEL_HIGHLIGHT_DURATION          = 200;
const PIXEL_HIGHLIGHT_COLOR             = [0x0, 0x0, 0x0];
const DEFAULT_BRUSH_COLOR               = [0x0, 0x0, 0x0];
const DEFAULT_BRUSH_OPACITY             = 0.1;

const CANVAS_SHADER_FPS                 = 32;

const LAYER_INDEX_BACKGROUND            = 0;
const LAYER_INDEX_BRUSH                 = 1;
const LAYER_INDEX_HIGHLIGHT             = 2;


// 

class GridCanvas extends HTMLElement {

    #pixelMatrix;
    #rows;
    #columns;
    #pixels;

    constructor(rows, columns, width, height, r, g, b, a) {
        super();

        const cellWidth = width/columns;
        const cellHeight = height/rows;

        this.#pixelMatrix = [];
        this.#rows = rows;
        this.#columns = columns;
        this.#pixels = rows*columns;
        this.style.display = 'grid';
        this.style.gridTemplateRows = `repeat(${rows}, ${cellHeight}px)`;
        this.style.gridTemplateColumns = `repeat(${columns}, ${cellWidth}px)`;

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

                Object.defineProperty(pixel, 'rowIndex', {
                    value: i, writable: false
                });
                Object.defineProperty(pixel, 'columnIndex', {
                    value: j, writable: false
                });
                Object.defineProperty(pixel, 'gridCanvas', {
                    value: this, writable: false
                });

                pixel.classList.add(`grid-item-${i*columns + j}`);
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
        const i = Math.ceil(clamp(x, 0, 1)*this.rowCount);
        const j = Math.ceil(clamp(y, 0, 1)*this.columnCount);
        return this.getPixel(i, j);
    }

    traversePixels(onTraverse, ...callbackArgs) {
        for (let i = 0; i < this.rowCount; ++i)
            for (let j = 0; j < this.columnCount; ++j)
                if (onTraverse(this.getPixel(i, j), ...callbackArgs) === true)
                    return;
    }

    reset() {
        this.traversePixels((pixel) => pixel.clearLayers());
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

        constructor(r = 0xFF, g = 0xFF, b = 0xFF, a = 1) {
            this.setColor(r, g, b, a);
        }

        setColor(r, g, b, a) {
            this.red = r
            this.green = g;
            this.blue = b;
            this.alpha = a;
        }

        get red() {
            return this.#colorRed;
        }
        set red(value) {
            this.#colorRed = isNull(value)? this.#colorRed : clampColor(value);
        }

        get green() {
            return this.#colorGreen;
        }
        set green(value) {
            this.#colorGreen = isNull(value)? this.#colorGreen : clampColor(value);
        }

        get blue() {
            return this.#colorBlue;
        }
        set blue(value) {
            this.#colorBlue = isNull(value)? this.#colorBlue : clampColor(value);
        }

        get alpha() {
            return this.#colorAlpha;
        }
        set alpha(value) {
            this.#colorAlpha = isNull(value)? this.#colorAlpha : clamp(value);
        }

        get color() {
            return [this.red, this.green, this.blue, this.alpha];
        }
        set color(rgba) {
            this.setColor(...rgba);
        }
    };

    constructor(r = 0xFF, g = 0xFF, b = 0xFF, a = 1) {
        super();

        this.style.display = 'block';
        this.#colorLayers = [new GridPixel.Layer(r, g, b, a)];
        this.#currentLayerIndex = 0;

        this.#updateColor();
    }

    #updateColor() {
        let r = this.#colorLayers[0].red;
        let g = this.#colorLayers[0].green;
        let b = this.#colorLayers[0].blue;
        let a = this.#colorLayers[0].alpha;

        for (let i = 0; i < this.#colorLayers.length; ++i) {
            const layer = this.#colorLayers[i];

            r += (layer.red - r)*layer.alpha;
            g += (layer.green - g)*layer.alpha;
            b += (layer.blue - b)*layer.alpha;

            a = Math.max(a, layer.alpha);
        }

        r = clampColor(r);
        g = clampColor(g);
        b = clampColor(b);
        a = clampColor(a);

        this.#colorRed = r;
        this.#colorGreen = g;
        this.#colorBlue = b;
        this.#colorAlpha = a;

        this.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    get currentLayer() {
        return this.#colorLayers[this.#currentLayerIndex];
    }
    switchLayer(i) {
        console.assert(!isNull(i) && i >= 0 && i < this.#colorLayers.length,
                "Invalid layer index");

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
        if (isNull(value)) return;

        this.currentLayer.red = value;
        this.#updateColor();
    }

    get computedGreen() {
        return this.#colorGreen;
    }
    get green() {
        return this.currentLayer.green;
    }
    set green(value) {
        if (isNull(value)) return;

        this.currentLayer.green = value;
        this.#updateColor();
    }

    get computedBlue() {
        return this.#colorBlue;
    }
    get blue() {
        return this.currentLayer.blue;
    }
    set blue(value) {
        if (isNull(value)) return;

        this.currentLayer.blue = value;
        this.#updateColor();
    }

    get computedAlpha() {
        return this.#colorAlpha;
    }
    get alpha() {
        return this.currentLayer.alpha;
    }
    set alpha(value) {
        if (isNull(value)) return;

        this.currentLayer.alpha = value;
        this.#updateColor();
    }

    get computedColor() {
        return [this.computedRed, this.computedGreen, this.computedBlue, this.computedAlpha];
    }
    get color() {
        return [this.red, this.green, this.blue, this.alpha];
    }
    set color(rgba) {
        this.currentLayer.color = rgba;
        this.#updateColor();
    }

    setColor(r, g, b, a) {
        this.currentLayer.setColor(r, g, b, a);
        this.#updateColor();
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
        this.#updateColor();

        if (this.#currentLayerIndex === this.#colorLayers.length - 1)
            --this.#currentLayerIndex;

        return popped;
    }
    clearLayers() {
        if (this.#colorLayers.length < 1) return;
        this.#colorLayers.splice(1);
        this.#currentLayerIndex = 0;
        this.#updateColor();
    }

    traverseLayers(onTraverse, topDown = false, ...callbackArgs) {
        if (topDown) {
            for (let i = this.#colorLayers.length - 1; i >= 0; --i)
                if (onTraverse(this.#colorLayers[i], ...callbackArgs) === true)
                    return;
        } else {
            for (let i = 0; i < this.#colorLayers.length; ++i)
                if (onTraverse(this.#colorLayers[i], ...callbackArgs) === true)
                    return;
        }
    }
}


// Main procedure

const mainContainer = document.querySelector("#main-container div.body");
const canvasClearButton = document.querySelector("#clear-button");
const canvasResetButton = document.querySelector("#reset-button");
const brushOpacityRange = document.querySelector("#brush-opacity-range");
const brushColorPicker = document.querySelector("#brush-color-picker");
const rowCountInput = document.querySelector(".rows-input");
const columnCountInput = document.querySelector(".columns-input");
const modalbox = document.querySelector(".modal");
const modalboxResetButton = document.querySelector(".modalbox .reset-button");

window.customElements.define('grid-canvas', GridCanvas);
window.customElements.define('grid-pixel', GridPixel);

let time = 0;
let gridCanvas;
let intervalId;
let brushColor = DEFAULT_BRUSH_COLOR;
let brushOpacity = DEFAULT_BRUSH_OPACITY;

rowCountInput.value = DEFAULT_CANVAS_ROW_COUNT;
columnCountInput.value = DEFAULT_CANVAS_COLUMN_COUNT;
brushColorPicker.value = colorToHexStr(...DEFAULT_BRUSH_COLOR);
brushOpacityRange.value = DEFAULT_BRUSH_OPACITY;

window.addEventListener('click', onWindowClick);
document.addEventListener('visibilitychange', onDocumentVisibilityChange);
canvasClearButton.addEventListener('click', onCanvasClearButtonClick);
canvasResetButton.addEventListener('click', onCanvasResetButtonClick);
modalboxResetButton.addEventListener('click', onModalboxResetButtonClick);
brushColorPicker.addEventListener('change', onBrushColorPickerChange);
brushOpacityRange.addEventListener('change', onBrushOpacityRangeChange);
rowCountInput.addEventListener('change', onRowCountInputChange);
columnCountInput.addEventListener('change', onColumnCountInputChange);

gridCanvas = createGridCanvas();
intervalId = initPeriodicActions(CANVAS_SHADER_FPS);


// Helper functions

function isNull(value) {
    return value === null || value === undefined;
}

function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}

function clampColor(value) {
    return clamp(value, 0, 0xFF);
}

function colorToHexStr(r, g, b) {
    r = r.toString(16);
    if (r.length == 1) r = `0${r}`;
    g = g.toString(16);
    if (g.length == 1) g = `0${g}`;
    b = b.toString(16);
    if (b.length == 1) b = `0${b}`;
    return `#${r}${g}${b}`;
}

function hexStrToColor(hexcolor) {
    const rgbHex = hexcolor.substr(1).match(/.{1,2}/g);
    return [
        parseInt(rgbHex[0], 16),
        parseInt(rgbHex[1], 16),
        parseInt(rgbHex[2], 16)
    ];
}

function colorEquals(c1, c2) {
    return (
        c1[0] === c2[0] &&
        c1[1] === c2[1] &&
        c1[2] === c2[2]
    )
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// 

function defaultPixelColor(i, j, rows, columns) {
    const pixels = rows*columns;
    return [
        0xFF*(i*columns + j)/pixels,
        0xFF*(j*rows + i)/pixels,
        0xFF*(i*columns)/pixels,
        1
    ];
}

function createGridCanvas() {
    const rows = rowCountInput.value;
    const columns = columnCountInput.value;
    const canvas = new GridCanvas(rows, columns, GRID_CANVAS_WIDTH,
            GRID_CANVAS_HEIGHT);
    canvas.traversePixels(onGridPixelInit);
    if (!isNull(gridCanvas)) mainContainer.removeChild(gridCanvas);
    mainContainer.appendChild(canvas);
    return canvas;
}

function initPeriodicActions(fps) {
    gridCanvas.traversePixels(onPeriod, time);
    return setInterval(() => {
        time += 1/fps;
        gridCanvas.traversePixels(onPeriod, time);
    }, 1000/fps);
}


// Event handlers & Callback functions

function onPixelLayersInit(pixel) {
    pixel.pushLayer();
    pixel.color = COLOR_NULL;
    pixel.pushLayer();
    pixel.color = COLOR_NULL;
}

async function onMouseHoverStart(e) {
    let prevIndex = this.switchLayer(LAYER_INDEX_HIGHLIGHT);
    this.color = [...brushColor, 1];
    this.switchLayer(prevIndex);

    await sleep(PIXEL_HIGHLIGHT_DURATION);

    prevIndex = this.switchLayer(LAYER_INDEX_HIGHLIGHT);
    this.color = COLOR_NULL;
    this.switchLayer(prevIndex);
}

function onMouseHoverEnd(e) {
    const prevIndex = this.switchLayer(LAYER_INDEX_BRUSH);
    if (!colorEquals(this.color, brushColor))
        this.alpha = 0; 
    this.color = [...brushColor, this.alpha + brushOpacity];
    this.switchLayer(prevIndex);
}

function onCanvasClearButtonClick(e) {
    gridCanvas.reset();
    gridCanvas.traversePixels(pixel => {onPixelLayersInit(pixel);});
}

function onCanvasResetButtonClick(e) {
    modalbox.style.display = 'flex';
}

function onModalboxResetButtonClick(e) {
    modalbox.style.display = 'none';
    gridCanvas = createGridCanvas();
}

function onBrushColorPickerChange(e) {
    brushColor = hexStrToColor(this.value);
}

function onBrushOpacityRangeChange(e) {
    brushOpacity = parseFloat(this.value);
}

function onRowCountInputChange(e) {
    this.value = clamp(parseInt(this.value),
            MIN_CANVAS_ROW_COUNT, MAX_CANVAS_ROW_COUNT);
}

function onColumnCountInputChange(e) {
    this.value = clamp(parseInt(this.value),
            MIN_CANVAS_COLUMN_COUNT, MAX_CANVAS_COLUMN_COUNT);
}

function onWindowClick(e) {
    if (e.target == modalbox)
        modalbox.style.display = 'none';
}

function onPeriod(pixel, time) {
    const canvas = pixel.gridCanvas;
    const aspectRatio = canvas.offsetWidth/canvas.offsetHeight;
    const x = pixel.columnIndex/canvas.columnCount;
    const y = pixel.rowIndex/canvas.rowCount;

    const color = onShaderPeriod(x*aspectRatio, y, aspectRatio, 1, time);

    const prevIndex = pixel.switchLayer(LAYER_INDEX_BACKGROUND);
    pixel.color = color;
    pixel.switchLayer(prevIndex);
}

function onGridPixelInit(pixel) {
    pixel.addEventListener('mouseover', onMouseHoverStart);
    pixel.addEventListener('mouseout', onMouseHoverEnd);

    onPixelLayersInit(pixel);
}

function onDocumentVisibilityChange() {
    if (document.visibilityState === 'hidden')
        clearInterval(intervalId);
    else
        intervalId = initPeriodicActions(CANVAS_SHADER_FPS);
}

function onShaderPeriod(x, y, maxX, maxY, time) {
    // Shader pattern copied from https://www.shadertoy.com/view/NdKXzw then
    // translated to JavaScript.

    function length(vx, vy) {
        return Math.sqrt(vx*vx + vy*vy);
    }
    function mix(lo, hi, value) {
        return lo*(1 - value) + hi*a;
    }
    function smoothstep(lo, hi, value) {
        let t = clamp((value - lo)/(hi - lo), 0, 1);
        return t*t*(3 - 2*t);
    }

    const MIN_DIAM = 0.5;
    const MAX_DIAM = 0.8;

    let uvx = x - 0.5*maxX;
    let uvy = y - 0.5*maxY;
    const a = Math.PI/4;
    const c = Math.cos(a);
    const s = Math.sin(a);

    const mat = [c, -s, s, c];
    const nuvx = mat[0]*uvx + mat[2]*uvy;
    const nuvy = mat[1]*uvx + mat[3]*uvy;
    uvx = 8*nuvx;
    uvy = 8*nuvy;

    const gvx = uvx%1;
    const gvy = uvy%1;
    const idx = Math.floor(uvx);
    const idy = Math.floor(uvy);
    let m = 0;

    const nd = 1;

    for (let i = -nd; i <= nd; ++i) {
        for (let j = -nd; j <= nd; ++j) {
            const d = length(gvx - i, gvy - j);
            const dist = length(idx + i, idy + j);
            const truc = Math.sin(dist - 7*time)*0.5 + 0.5;

            let rx = mix(MIN_DIAM, MAX_DIAM, truc);
            let ry = rx - 0.00009;

            m += smoothstep(rx, ry, d)*0.3;
        }
    }

    // return rgba as array
    return [0xFF*(m + 0.4), 0xFF*(m*0.6 + 0.6), 0xFF*(m*0.5 + 0.4), 1];
}