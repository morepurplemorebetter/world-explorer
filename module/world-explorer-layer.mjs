import { SceneUpdater } from "./scene-updater.mjs";

const MODULE = "world-explorer";

/**
 * A pair of row and column coordinates of a grid space.
 * @typedef {object} GridOffset
 * @property {number} i    The row coordinate
 * @property {number} j    The column coordinate
 */

export const DEFAULT_SETTINGS = {
    color: "#000000",
    partialColor: "",
    revealRadius: 0,
    gridRevealRadius: 0,
    opacityGM: 0.7,
    opacityPlayer: 1,
    partialOpacityGM: 0.3,
    partialOpacityPlayer: 0.3,
    persistExploredAreas: false,
    position: "behindDrawings"
};

// DEV NOTE: On sorting layers
// Elements within the primary canvas group are sorted via the following heuristics:
// 1. The object's elevation property. Drawables use their ZIndex, Tiles have a fixed value if overhead
// 2. The layer's static PRIMARY_SORT_ORDER.
// 3. The object's sort property

/** 
 * The world explorer canvas layer, which is added to the primary canvas layer.
 * The primary canvas layer is host to the background, and the actual token/drawing/tile sprites.
 * The separate token/drawing/tiles layers in the interaction layer are specifically for drawing borders and rendering the hud.
 */
export class WorldExplorerLayer extends InteractionLayer {
    /**
     * Providing baseClass for proper 'name' support
     * @see InteractionLayer
     */
    static get layerOptions() {
        return {
            ...super.layerOptions,
            name: "worldExplorer",
            baseClass: WorldExplorerLayer
        };
    }

    get sortLayer() {
        // Tokens are 700, Drawings are 600, Tiles are 500
        switch (this.settings.position) {
            case "front":
                return 1000;
            case "behindTokens":
                return 650;
            case "behindDrawings":
                return 550;
            default:
                return 0;
        }
    }

    constructor() {
        super();
        this.color = "#000000";
        this.partialColor = "#000000";

        /** @type {Partial<WorldExplorerState>} */
        this.state = {};
    }

    /** Any settings we are currently previewing. Currently unused, will be used once we're more familiar with the scene config preview */ 
    previewSettings = {};

    /** @returns {WorldExplorerFlags} */
    get settings() {
        const settings = this.scene.flags[MODULE] ?? {};
        return { ...DEFAULT_SETTINGS, ...settings, ...this.previewSettings };
    }

    get elevation() {
        return this.settings.position === "front" ? Infinity : 0;
    }

    /**
     * Get a GridHighlight layer for this Ruler
     * @type {GridHighlight}
     */
    get highlightLayer() {
        return canvas.interface.grid.highlightLayers[this.name] || canvas.interface.grid.addHighlightLayer(this.name);
    }

    /** @type {GridOffset[]} */
    get revealed() {
        return (this.scene.getFlag(MODULE, "gridPositions") ?? []).map(([i, j, state]) => (state === "reveal" ? { i, j } : false)).filter(n => n);
    }

    /** @type {GridOffset[]} */
    get partials() {
        return (this.scene.getFlag(MODULE, "gridPositions") ?? []).map(([i, j, state]) => (state === "partial" ? { i, j } : false)).filter(n => n);
    }

    get enabled() {
        return !!this._enabled;
    }

    set enabled(value) {
        this._enabled = !!value;
        this.visible = !!value;
        
        if (value) {
            this.refreshOverlays();
            this.refreshMasks();
        } else {
            this.removeChildren()
        }
    }

    /** Returns true if the user is currently editing and the config dialog of the scene is not open, false otherwise. */
    get editing() {
        return this.enabled && this.state.clearing;
    }


    /** Set the settings to `this` on initialize and updates. */
    updateSettings() {
        const flags = this.settings;
        this.hiddenAlpha = (game.user.isGM ? flags.opacityGM : flags.opacityPlayer) ?? 1;
        this.partialAlpha = (game.user.isGM ? flags.partialOpacityGM : flags.partialOpacityGM) ?? 0.3;
        this.color = flags.color;
        this.partialColor = flags.partialColor;
        this.image = flags.image;
        this._enabled = flags.enabled;
        this.visible = this._enabled;
    }

    initialize(options) {
        // The overlay covering the hidden
        this.hiddenOverlay = new PIXI.Graphics();
        // The overlay covering the partially revealed
        this.partialOverlay = new PIXI.Graphics();

        // Create mask (to punch holes in to reveal/partial tiles/players)
        const dimensions = canvas.dimensions;
        this.maskTexture = PIXI.RenderTexture.create({
            width: dimensions.sceneRect.width,
            height: dimensions.sceneRect.height,
        })
        this.maskSprite = new PIXI.Sprite();
        this.maskSprite.texture = this.maskTexture;

        // Create mask to determine where the partial overlay should show up
        this.partialMaskTexture = PIXI.RenderTexture.create({
            width: dimensions.sceneRect.width,
            height: dimensions.sceneRect.height,
        })
        this.partialMaskSprite = new PIXI.Sprite();
        this.partialMaskSprite.texture = this.partialMaskTexture;
        this.partialOverlay.addChild(this.partialMaskSprite);
        this.partialOverlay.mask = this.partialMaskSprite;

        // Create the overlay
        this.addChild(this.hiddenOverlay);
        this.addChild(this.partialOverlay);
        this.addChild(this.imageSprite);
        this.addChild(this.maskSprite);
        this.mask = this.maskSprite;

        this.updateSettings();

        this.#migratePositions();
    }

    async _draw() {
        // console.log("MPMB | _draw");
        const scene = canvas.scene;
        this.scene = scene;
        this.updater = new SceneUpdater(scene);
        
        // Create sprite to draw fog of war image over. Because of load delays, create this first
        // It will get added to the overlay later
        const dimensions = canvas.dimensions;
        this.imageSprite = new PIXI.Sprite();
        this.imageSprite.position.set(dimensions.sceneRect.x, dimensions.sceneRect.y);
        this.imageSprite.width = dimensions.sceneRect.width;
        this.imageSprite.height = dimensions.sceneRect.height;

        this.state = {};
        this.initialize();
        this.refreshOverlays();
        this.refreshImage();

        return this;
    }

    /** Triggered when the current scene update */
    update() {
        if (this.#migratePositions()) {
            return;
        }

        const flags = this.settings;
        const imageChanged = this.image !== flags.image;
        const becameEnabled = !this.enabled && flags.enabled;

        this.updateSettings();

        this.refreshMasks();
        this.refreshOverlays();
        if (imageChanged || !flags.enabled || becameEnabled) {
            this.refreshImage();
        }
        // console.log("MPMB | update", this);
    }

    // Work around foundry bug https://github.com/foundryvtt/foundryvtt/issues/10201
    activate() {
        // console.log("MPMB | activate", this);
        if (!this.enabled) {
            const control = ui.controls.controls[0];
            ui.controls.initialize({ layer: control.layer });
            return this.deactivate();
        }

        return super.activate();
    }

    /** @param {EditingMode} mode */
    startEditing(mode) {
        this.state.clearing = true;
        this.state.tool = mode;
        if (this.enabled) {
            this.highlightLayer.clear();
        }
    }

    stopEditing() {
        this.state.clearing = false;
        if (this.enabled) {
            this.highlightLayer.clear();
        }
    }

    refreshImage(image=null) {
        image = this.image ?? image;
        if (this.enabled && image) {
            loadTexture(image).then((texture) => {
                this.imageSprite.texture = texture;
            });
        } else {
            this.imageSprite.texture = null;
        }
    }

    refreshOverlays() {
        if (!this.enabled || this.hiddenAlpha === 0) return;
        // The overlay covering the hidden
        this.hiddenOverlay.beginFill(0xFFFFFF);
        this.hiddenOverlay.drawRect(0, 0, canvas.dimensions.width, canvas.dimensions.height);
        this.hiddenOverlay.endFill();
        this.hiddenOverlay.tint = Color.from(this.color) ?? 0x000000;
        // The overlay covering the partial
        this.partialOverlay.beginFill(0xFFFFFF);
        this.partialOverlay.drawRect(0, 0, canvas.dimensions.width, canvas.dimensions.height);
        this.partialOverlay.endFill();
        this.partialOverlay.tint = Color.from(this.partialColor) ?? this.hiddenOverlay.tint;
    }

    refreshMasks() {
        // console.log("MPMB | refreshMasks");
        if (!this.enabled || this.hiddenAlpha === 0) return;
        const mainMask = new PIXI.Graphics();
        const partialMask = new PIXI.Graphics();
        const { sceneRect } = canvas.dimensions;
        const gridRevealRadius = this.getGridRevealRadius();

        // set the size of the masks
        mainMask.position.set(-sceneRect.x, -sceneRect.y);
        partialMask.position.set(-sceneRect.x, -sceneRect.y);

        // the main mask covers everything by default, using the main hiding alpha
        mainMask.beginFill(0xFFFFFF, this.hiddenAlpha);
        mainMask.drawRect(0, 0, canvas.dimensions.width, canvas.dimensions.height);
        mainMask.endFill();

        // draw black over the tiles that are revealed, after the partial, so gridRevealRadius is done properly
        mainMask.beginFill(0x000000);

        for (const position of this.revealed) {
            // Draw circles if extend grid elements is set
            if (gridRevealRadius > 0) {
                const { x, y } = canvas.grid.getCenterPoint(position);
                mainMask.drawCircle(x, y, gridRevealRadius);
            } else {
                // Otherwise just fill the grid
                const poly = this._getGridPolygon(position);
                mainMask.drawPolygon(poly);
            }
        }
        // also draw black of the the tiles that are partial, so we can set another alpha for them below
        for (const position of this.partials) {
            const poly = this._getGridPolygon(position);
            mainMask.drawPolygon(poly);
        }

        // draw black over observer tokens
        const tokenRevealRadius = Math.max(Number(this.scene.getFlag(MODULE, "revealRadius")) || 0, 0);
        if (tokenRevealRadius > 0) {
            for (const token of canvas.tokens.placeables) {
                const document = token.document;
                if (document.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY || document.hasPlayerOwner) {
                    const x = token.center.x;
                    const y = token.center.y;
                    mainMask.drawCircle(x, y, token.getLightRadius(tokenRevealRadius));
                }
            }
        }
        
        mainMask.endFill();

        // draw the tiles that are partial with their own alpha in the mainMask and as white in the partialMask
        mainMask.beginFill(0xFFFFFF, this.partialAlpha);
        partialMask.beginFill(0xFFFFFF);
        for (const position of this.partials) {
            // Don't draw extended area for partials, as that will result in overlapping transparant circles, which looks terrible
            const poly = this._getGridPolygon(position);
            mainMask.drawPolygon(poly);
            partialMask.drawPolygon(poly);
        }
        mainMask.endFill();
        partialMask.endFill();

        // if gridReveal is set, we have to now cut where the revealed tiles extend into the partial tiles out of the partial tiles' masks
        if (gridRevealRadius > 0) {
            mainMask.beginFill(0x000000);
            partialMask.beginFill(0x000000);
            for (const position of this.revealed) {
                const { x, y } = canvas.grid.getCenterPoint(position);
                mainMask.drawCircle(x, y, gridRevealRadius);
                partialMask.drawCircle(x, y, gridRevealRadius);
            }
            mainMask.endFill();
            partialMask.endFill();
        }

        // render the layer
        canvas.app.renderer.render(mainMask, { renderTexture: this.maskTexture });
        this.maskSprite.position.set(sceneRect.x, sceneRect.y);
        mainMask.destroy();
        canvas.app.renderer.render(partialMask, { renderTexture: this.partialMaskTexture });
        this.partialMaskSprite.position.set(sceneRect.x, sceneRect.y);
        partialMask.destroy();
    }

    /** Returns the grid reveal distance in canvas coordinates (if configured) */
    getGridRevealRadius() {
        const gridRadius = Math.max(Number(this.scene.getFlag(MODULE, "gridRevealRadius")) || 0, 0);
        if (!(gridRadius > 0)) return 0;

        // Convert from units to pixel radius, stolen from token.getLightRadius()
        const u = Math.abs(gridRadius);
        const hw = (canvas.grid.sizeX / 2);
        return (((u / canvas.dimensions.distance) * canvas.dimensions.size) + hw) * Math.sign(gridRadius);
    }

    /**
     * Returns true if a grid coordinate (x, y) is revealed.
     * @param {Point} position
     */
    isRevealed(position) {
        return this._getRevealedIndex(position.x, position.y) > -1;
    }

    /**
     * Returns true if a grid coordinate (x, y) is partly revealed.
     * @param {Point} position
     */
    isPartial(position) {
        return this._getPartialIndex(position.x, position.y) > -1;
    }

    /** 
     * Reveals a coordinate and saves it to the scene
     * @param {Point} position
     */
    reveal(position) {
        if (!this.enabled) return;
        this.updater.reveal(position.x, position.y);
    }

    /** 
     * Partial a coordinate and saves it to the scene
     * @param {Point} position
     */
    partial(position) {
        if (!this.enabled) return;
        this.updater.partial(position.x, position.y);
    }

    /** 
     * Unreveals a coordinate and saves it to the scene 
     * @param {Point} position
     */
    unreveal(position) {
        if (!this.enabled) return;
        this.updater.hide(position.x, position.y);
    }

    /** Clears the entire scene. If reveal: true is passed, reveals all positions instead */
    clear(options) {
        this.updater.clear(options);
    }

    onCanvasReady() {
        this.refreshMasks();
        this.registerMouseListeners();
    }

    registerMouseListeners() {
        // Renders the highlight to use for the grid's future status
        const renderHighlight = (position, revealed, partial) => {
            const { x, y } = canvas.grid.getTopLeftPoint(position);
            this.highlightLayer.clear();
            
            // In certain modes, we only go one way, check if the operation is valid
            const canReveal = (!revealed && ["toggle", "reveal"].includes(this.state.tool)) || (partial && this.state.tool === "reveal");
            const canHide = (revealed && ["toggle", "hide"].includes(this.state.tool)) || (partial && this.state.tool === "hide");
            const canPartial = !partial && this.state.tool === "partial";

            if (canReveal || canHide || canPartial) {
                // red colour for revealing tiles
                let color = 0xFF0000;
                if (canPartial) {
                    // default to purple for making tiles partly revealed
                    color = this.partialColor === "#000000" ? 0x7700FF : Color.from(this.partialColor); 
                } else if (canHide) {
                    // default to blue for making tiles hidden
                    color = this.color === "#000000" ? 0x0022FF : Color.from(this.color);
                }
                canvas.interface.grid.highlightPosition(this.highlightLayer.name, { x, y, color, border: color });
            }
        };

        canvas.stage.addListener('pointerdown', (event) => {
            if (!this.enabled) return;

            const canReveal = ["toggle", "reveal"].includes(this.state.tool);
            const canHide = ["toggle", "hide"].includes(this.state.tool);
            const canPartial = this.state.tool === "partial";

            if (this.editing && event.data.button === 0 && event.srcElement.tagName === "CANVAS") {
                console.log("MPMB | pointerdown", event);
                const coords = event.data.getLocalPosition(canvas.app.stage);
                const revealed = this.isRevealed(coords);
                const partial = this.isPartial(coords);

                if ((revealed || partial) && canHide) {
                    this.unreveal(coords);
                } else if (!revealed && canReveal) {
                    this.reveal(coords);
                } else if (!partial && canPartial) {
                    this.partial(coords);
                } else {
                    return;
                }

                renderHighlight(coords, revealed, partial);
            }
        });

        canvas.stage.addListener('pointermove', (event) => {
            if (!(this.enabled && this.editing)) return;

            // Get mouse position translated to canvas coords
            const coords = event.data.getLocalPosition(canvas.app.stage);
            const revealed = this.isRevealed(coords);
            const partial = this.isPartial(coords);
            renderHighlight(coords, revealed, partial);

            // For brush or eraser modes, allow click drag drawing
            if (event.data.buttons === 1 && this.state.tool !== "toggle" && event.srcElement.tagName === "CANVAS") {
                console.log("MPMB | pointermove", event);
                if ((partial || revealed) && this.state.tool === "hide") {
                    this.unreveal(coords);
                } else if (!revealed && this.state.tool === "reveal") {
                    this.reveal(coords);
                } else if (!partial && this.state.tool === "partial") {
                    this.partial(coords);
                }
            }
        });
    }

    /**
     * Gets the grid polygon from a grid position (row and column).
     * @param {GridOffset} offset
     */
    _getGridPolygon(offset) {
        // todo: check if this has issues with gaps again. If so, bring back expandPolygon
        return new PIXI.Polygon(canvas.grid.getVertices(offset));
    }

    /** @param {PointArray} point */
    _getRevealedIndex(...point) {
        const { i, j } = canvas.grid.getOffset({ x: point[0], y: point[1] });
        return this.revealed.findIndex((r) => r.i === i && r.j === j);
    }

    /** @param {PointArray} point */
    _getPartialIndex(...point) {
        const { i, j } = canvas.grid.getOffset({ x: point[0], y: point[1] });
        return this.partials.findIndex((r) => r.i === i && r.j === j);
    }

    /** Attempt to migrate from older positions (absolute coords) to newer positions (row/col). */
    #migratePositions() {
        const flags = this.settings;
        const revealedFlag = "revealed" in flags;
        const revealedPositionsFlag = "revealedPositions" in flags;
        if (revealedFlag || revealedPositionsFlag) {
            let newRevealed = [];
            if (revealedFlag) {
                newRevealed = flags.revealed.map((position) => canvas.grid.getGridPositionFromPixels(...position).concat("reveal"));
            } else if (revealedPositionsFlag) {
                newRevealed = flags.revealedPositions.map((position) => position.concat("reveal"));
            }
            canvas.scene.flags["world-explorer"].revealed = null;
            canvas.scene.flags["world-explorer"].revealedPositions = null;
            this.scene.update({
                "flags.world-explorer.gridPositions": newRevealed,
                "flags.world-explorer.-=revealedPositions": null,
                "flags.world-explorer.-=revealed": null
            });
            ui.notifications.info(game.i18n.localize("WorldExplorer.Notifications.Migrated"));
            return true;
        }

        return false;
    }
}