const PIXEL_DEFAULT_RED = 255;
const PIXEL_DEFAULT_GREEN = 255;
const PIXEL_DEFAULT_BLUE = 255;
const PIXEL_DEFAULT_ALPHA = 255;


const gridContainer = document.querySelector("#grid");
const gridContainerWidth = gridContainer.clientWidth;
const gridContainerHeight = gridContainer.clientHeight;

function clampColor(value) {
    return Math.max(0, Math.min(0xFF, value));
}

class GridCanvas extends HTMLElement {

    #pixelMatrix;

    constructor(rows, columns, width, height) {
        super();

        const cellWidth = width/columns;
        const cellHeight = height/rows;

        this.#pixelMatrix = [];
        this.style.display = 'grid';
        this.style.gridTemplateRows = `repeat(${rows}, ${cellHeight}px)`;
        this.style.gridTemplateColumns = `repeat(${columns}, ${cellWidth}px)`;

        for (let i = 0; i < rows; ++i) {
            const pixelRow = [];

            for (let j = 0; j < columns; ++j) {
                const r = i*columns + j;
                const g = j*rows + i;
                const b = i*columns;
                const pixel = new GridPixel(r, g, b);

                Object.defineProperty(pixel, 'rowIndex', {
                    value: i, writable: false
                });
                Object.defineProperty(pixel, 'columnIndex', {
                    value: j, writable: false
                });

                pixel.classList.add(`grid-item-${i*columns + j}`);
                pixel.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
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

    getPixel(i, j) {
        return this.#pixelMatrix[i][j];
    }

    traversePixels(onTraverse) {
        for (let i = 0; i < this.#pixelMatrix.length; ++i)
            for (let j = 0; j < this.#pixelMatrix[i].length; ++j)
                onTraverse(this.getPixel(i, j))
    }

    reset() {
        this.traversePixels((pixel) => pixel.resetColor());
    }
}

class GridPixel extends HTMLElement {

    #colorRed;
    #colorGreen;
    #colorBlue;
    #colorAlpha;
    #colorRedInitial;
    #colorGreenInitial;
    #colorBlueInitial;
    #colorAlphaInitial;

    constructor(r = 255, g = 255, b = 255, a = 255) {
        super();
        this.style.display = 'block';
        this.setColor(r, g, b, a);
        this.#colorRedInitial = this.#colorRed;
        this.#colorGreenInitial = this.#colorGreen;
        this.#colorBlueInitial = this.#colorBlue;
        this.#colorAlphaInitial = this.#colorAlpha;
    }

    #updateColor() {
        this.style.backgroundColor = `rgba(${this.#colorRed}, ` +
            `${this.#colorGreen}, ` +
            `${this.#colorBlue}, ` +
            `${this.#colorAlpha})`;
    }

    get red() {
        return this.#colorRed;
    }
    set red(value) {
        this.#colorRed = clampColor(value);
        this.#updateColor();
    }

    get green() {
        return this.#colorGreen;
    }
    set green(value) {
        this.#colorGreen = clampColor(value);
        this.#updateColor();
    }

    get blue() {
        return this.#colorBlue;
    }
    set blue(value) {
        this.#colorBlue = clampColor(value);
        this.#updateColor();
    }

    setColor(r, g, b, a) {
        this.#colorRed = clampColor(r);
        this.#colorGreen = clampColor(g);
        this.#colorBlue = clampColor(b);
        this.#colorAlpha = clampColor(a);
        this.#updateColor();
    }

    resetColor() {
        this.setColor(this.#colorRedInitial, this.#colorGreenInitial,
                this.#colorBlueInitial, this.#colorAlphaInitial);
    }
}

function onMouseEnter(e) {
    this.red = 255;
    this.green = 0;
    this.red = 0;
}

function onMouseExit(e) {
    this.red = 0;
    this.green = 0;
    this.red = 0;
}

window.customElements.define('grid-canvas', GridCanvas);
window.customElements.define('grid-pixel', GridPixel);

const gridCanvas = new GridCanvas(64, 64, 480, 480);
gridCanvas.traversePixels(function (pixel) {
    pixel.addEventListener('mouseover', onMouseEnter);
    pixel.addEventListener('mouseout', onMouseExit);
    pixel.setColor(PIXEL_DEFAULT_RED, PIXEL_DEFAULT_GREEN,
            PIXEL_DEFAULT_BLUE, PIXEL_DEFAULT_ALPHA);
});
gridContainer.appendChild(gridCanvas);