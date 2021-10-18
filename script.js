const CANVAS_ROW_COUNT = 64;
const CANVAS_COLUMN_COUNT = 64;
const GRID_CANVAS_WIDTH = 480;
const GRID_CANVAS_HEIGHT = 480;
const PIXEL_HIGHLIGHT_COLOR = [0x0, 0x0, 0x0, 0xFF];
const STROKE_COLOR = [-0xFF, -0xFF, -0xFF, 0x0];
const CANVAS_SHADER_FPS = 32;


const mainContainer = document.querySelector("#main-container div.body");
const resetButton = document.querySelector("#reset-button");

const gridContainerWidth = mainContainer.clientWidth;
const gridContainerHeight = mainContainer.clientHeight;


function isNull(value) {
    return value === null || value === undefined;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function clampColor(value) {
    return clamp(value, 0, 0xFF);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function defaultPixelColor(i, j, rows, columns) {
    const pixels = rows*columns;
    return [
        0xFF*(i*columns + j)/pixels,
        0xFF*(j*rows + i)/pixels,
        0xFF*(i*columns)/pixels,
        0xFF
    ];
}

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

        constructor(r = 0xFF, g = 0xFF, b = 0xFF, a = 0xFF) {
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
            this.#colorRed = isNull(value)? this.#colorRed : clamp(value, -0xFF, 0xFF);
        }

        get green() {
            return this.#colorGreen;
        }
        set green(value) {
            this.#colorGreen = isNull(value)? this.#colorGreen : clamp(value, -0xFF, 0xFF);
        }

        get blue() {
            return this.#colorBlue;
        }
        set blue(value) {
            this.#colorBlue = isNull(value)? this.#colorBlue : clamp(value, -0xFF, 0xFF);
        }

        get alpha() {
            return this.#colorAlpha;
        }
        set alpha(value) {
            this.#colorAlpha = isNull(value)? this.#colorAlpha : clamp(value, -0xFF, 0xFF);
        }

        get color() {
            return [this.red, this.green, this.blue, this.alpha];
        }
        set color(rgba) {
            this.setColor(...rgba);
        }
    };

    constructor(r = 0xFF, g = 0xFF, b = 0xFF, a = 0xFF) {
        super();
        this.style.display = 'block';
        this.#colorLayers = [new GridPixel.Layer(r, g, b, a)];
        this.#currentLayerIndex = 0;
        this.#updateColor();
    }

    #updateColor() {
        let red = 0x0;
        let green = 0x0;
        let blue = 0x0;
        let alpha = 0x0;
        this.traverseLayers((layer) => {
            const opacity = layer.alpha/0xFF;
            red += opacity*layer.red;
            green += opacity*layer.green;
            blue += opacity*layer.blue;
            alpha = Math.max(alpha, layer.alpha);
            return alpha === 0xFF;
        }, true);
        this.#colorRed = clampColor(red);
        this.#colorGreen = clampColor(green);
        this.#colorBlue = clampColor(blue);
        this.#colorAlpha = clampColor(alpha);
        this.style.backgroundColor = `rgba(${this.#colorRed}, ` +
            `${this.#colorGreen}, ${this.#colorBlue}, ${this.#colorAlpha})`;
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
        const newLayer = new GridPixel.Layer(0x0, 0x0, 0x0, 0x0);
        this.#colorLayers.splice(this.#currentLayerIndex + 1, 0, newLayer);
        if (setAsCurrent) ++this.#currentLayerIndex;
        return newLayer;
    }
    popLayer() {
        if (this.#currentLayerIndex === 0) return;
        const popped = this.#colorLayers.splice(this.#currentLayerIndex, 1)[0];
        this.#updateColor();
        if (this.#currentLayerIndex === this.#colorLayers.length - 1) {
            --this.#currentLayerIndex;
        }
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

async function onMouseEnter(e) {
    let prevIndex = this.switchLayer(2);
    this.alpha = 0xFF;
    this.switchLayer(prevIndex);

    await sleep(100);

    prevIndex = this.switchLayer(2);
    this.alpha = 0x0;
    this.switchLayer(prevIndex);
}

function onMouseExit(e) {
    const prevIndex = this.switchLayer(1);
    this.alpha += 0xFF/10;
    this.switchLayer(prevIndex);
}

window.customElements.define('grid-canvas', GridCanvas);
window.customElements.define('grid-pixel', GridPixel);

const gridCanvas = new GridCanvas(CANVAS_ROW_COUNT, CANVAS_COLUMN_COUNT,
        GRID_CANVAS_WIDTH, GRID_CANVAS_HEIGHT);
gridCanvas.traversePixels((pixel) => {
    pixel.addEventListener('mouseover', onMouseEnter);
    pixel.addEventListener('mouseout', onMouseExit);

    pixel.pushLayer();
    pixel.color = STROKE_COLOR;
    pixel.pushLayer();
    pixel.color = PIXEL_HIGHLIGHT_COLOR;
    pixel.alpha = 0x0;
});
mainContainer.appendChild(gridCanvas);

resetButton.addEventListener('click', (e) => {
    gridCanvas.reset();
    gridCanvas.traversePixels((pixel) => {
        pixel.pushLayer();
        pixel.color = STROKE_COLOR;
        pixel.pushLayer();
        pixel.color = PIXEL_HIGHLIGHT_COLOR;
        pixel.alpha = 0x0;
    });
});

function onPeriod(pixel, time) {
    const x = pixel.columnIndex/pixel.gridCanvas.columnCount;
    const y = pixel.rowIndex/pixel.gridCanvas.rowCount;
    const color = onShaderPeriod(x, y, time);
    const prevIndex = pixel.switchLayer(0);
    pixel.color = color;
    pixel.switchLayer(prevIndex);
}

let time = 0;
function initPeriodicActions(fps) {
    gridCanvas.traversePixels(onPeriod, time);
    return setInterval(() => {
        time += 1/fps;
        gridCanvas.traversePixels(onPeriod, time);
    }, 1000/fps);
}

let intervalId = initPeriodicActions(CANVAS_SHADER_FPS);

document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
        clearInterval(intervalId);
    } else {
        intervalId = initPeriodicActions(CANVAS_SHADER_FPS);
    }
});


function onShaderPeriod(x, y, time) {
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

    let uvx = x - 0.5;
    let uvy = y - 0.5;
    const a = Math.PI/4;
    const c = Math.cos(a);
    const s = Math.sin(a);

    const mat = [c, -s, s, c];
    const nuvx = mat[0]*uvx + mat[2]*uvy;
    const nuvy = mat[1]*uvx + mat[3]*uvy;
    uvx = 10*nuvx;
    uvy = 10*nuvy;

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
            const truc = Math.sin(dist - 6*time)*0.5 + 0.5;

            let rx = mix(MIN_DIAM, MAX_DIAM, truc);
            let ry = rx - 0.00009;

            m += smoothstep(rx, ry, d)*0.3;
        }
    }

    // return rgba as array
    return [0xFF*(m + 0.4), 0xFF*(m*0.6 + 0.6), 0xFF*(m*0.5 + 0.4), 0xFF];
}