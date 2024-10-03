import { DEFAULT_SETTINGS } from "./world-explorer-layer.mjs";

export class OpacityGMAdjuster extends Application {
    constructor(opacitySetting) {
        super({ id: `${opacitySetting}-adjuster` });
        this.opacityType = opacitySetting;
    }

    static instances = new Map();
    //static instance = new this();

    scene = null;

    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            width: 400,
            classes: ['world-explorer-opacity-adjuster'],
            minimizable: false
        };
    }

    get template() {
        return "modules/world-explorer/templates/opacity-adjuster.hbs";
    }

    async render(force = true, options) {
        this.scene = options.scene;
        if (!this.scene) return this;

        // Adjust position of this application's window
        const bounds = ui.controls.element.find(`li[data-tool="${this.opacityType}"]`)[0].getBoundingClientRect();
        options.left = bounds.right + 6;
        options.top = bounds.top - 3;

        return super.render(force, options);
    }

    getData() {
        const flags = this.scene.flags["world-explorer"] ?? {};
        return {
            label: game.i18n.localize(`WorldExplorer.Tools.${this.opacityType === 'opacityGM' ? 'Opacity' : 'PartialOpacity'}`),
            opacity: flags[this.opacityType] ?? DEFAULT_SETTINGS[this.opacityType]
        };
    }

    activateListeners($html) {
        if (!this.scene) return;

        $(`#${this.id}`).find(".window-header").remove();

        $html.on("input", (event) => {
            const value = Number(event.target.value);
            this.scene.update({ [`flags.world-explorer.${this.opacityType}`]: value });
        });
    }

    detectClose(controls) {
        if (controls.activeControl !== "world-explorer" && this.rendered) {
            $(`#${this.id}`).fadeOut(() => {
                this.close({ force: true });
            });
        }
    }

    toggleVisibility() {
        if (this.rendered) {
            $(`#${this.id}`).fadeOut(() => {
                this.close({ force: true });
            });
        } else {
            this.render(true, { scene: canvas.scene }).then(() => {
                $(`#${this.id}`).hide().fadeIn();
            });
        }
    }
}
