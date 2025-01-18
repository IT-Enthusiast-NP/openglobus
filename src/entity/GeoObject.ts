import * as utils from "../utils/shared";
import {Entity} from "./Entity";
import {Quat, Vec3, Vec4} from "../math/index";
import {GeoObjectHandler} from "./GeoObjectHandler";
import {InstanceData} from "./InstanceData";
import {NumberArray3} from "../math/Vec3";
import {NumberArray4} from "../math/Vec4";
import {Object3d} from "../Object3d";

const LOCAL_FORWARD = new Vec3(0.0, 0.0, -1.0);

export interface IGeoObjectParams {
    object3d?: Object3d;
    objSrc?: string;
    tag?: string;
    position?: Vec3 | NumberArray3;
    pitch?: number;
    yaw?: number;
    roll?: number;
    scale?: number | Vec3 | NumberArray3;
    translate?: Vec3 | NumberArray3;
    color?: Vec4 | NumberArray4 | string;
    visibility?: boolean;
}

/**
 * @class
 * @param {Object} options -  Geo object parameters:
 * @param {Vec3} [options.position] - Geo object position.
 *
 * @todo: GeoObject and GeoObjectHandler provides instanced objects only.
 * It would be nice if it could provide not instanced rendering loop too.
 */
class GeoObject {
    protected _tag: string;

    static __counter__: number = 0;

    public instanced: boolean;

    /**
     * Entity instance that holds this geo object.
     * @public
     * @type {Entity}
     */
    public _entity: Entity | null;

    /**
     * Geo object center cartesian position.
     * @protected
     * @type {Vec3}
     */
    protected _position: Vec3;
    public _rtcPositionHigh: Vec3;
    public _rtcPositionLow: Vec3;

    protected _scale: Vec3;
    protected _translate: Vec3;

    /**
     * RGBA color.
     * @public
     * @type {Vec4}
     */
    public _color: Vec4;

    protected _qFrame: Quat;
    public _qRot: Quat;
    protected _direction: Vec3;

    public _handler: GeoObjectHandler | null;
    public _handlerIndex = -1;

    public _tagData: InstanceData | null;
    public _tagDataIndex: number;

    protected _object3d: Object3d;
    public _objectSrc?: string;

    protected _visibility: boolean;

    protected _children: GeoObject[];

    constructor(options: IGeoObjectParams) {

        this._tag = options.tag || `tag_${GeoObject.__counter__++}`;

        this.instanced = true;

        this._entity = null;

        this._position = utils.createVector3(options.position);

        this._rtcPositionHigh = new Vec3();
        this._rtcPositionLow = new Vec3();

        this._scale = utils.createVector3(options.scale, new Vec3(1, 1, 1));
        this._translate = utils.createVector3(options.translate, new Vec3());
        this._translate = utils.createVector3(options.translate, new Vec3());

        this._color = utils.createColorRGBA(options.color, new Vec4(0.15, 0.15, 0.15, 1.0));

        this._handler = null;
        this._handlerIndex = -1;

        this._tagData = null;
        this._tagDataIndex = -1;
        let object3d = options.object3d;
        if ((!options.object3d || options.object3d?.vertices.length === 0)) {
            object3d = new Object3d();
        }
        if (options.objSrc) {
            this.setObjectSrc(options.objSrc)
            this._objectSrc = options.objSrc;
        }

        this._object3d = object3d as Object3d;

        // if (options.colorTexture) {
        //     this.setColorTexture(options.colorTexture)
        // }

        this._visibility = (options.visibility != undefined ? options.visibility : true);

        this._children = [];

        this._direction = new Vec3();

        this._qFrame = new Quat();

        this._qRot = Quat.IDENTITY;
    }

    public get tag() {
        return this._tag;
    }

    public getPosition(): Vec3 {
        return this._position;
    }

    public get object3d(): Object3d {
        return this._object3d;
    }

    public get vertices(): number[] {
        return this._object3d.vertices;
    }

    public get normals(): number[] {
        return this._object3d.normals;
    }

    public get texCoords(): number[] {
        return this._object3d.texCoords;
    }

    public get indices(): number[] {
        return this._object3d.indices;
    }

    /**
     * Sets geo object opacity.
     * @public
     * @param {number} a - Billboard opacity.
     */
    public setOpacity(a: number) {
        this._color.w = a;
        this.setColor(this._color.x, this._color.y, this._color.z, a);
    }

    public getOpacity(): number {
        return this._color.w;
    }

    /**
     * Sets color.
     * @public
     * @param {number} r - Red.
     * @param {number} g - Green.
     * @param {number} b - Blue.
     * @param {number} [a] - Alpha.
     */
    public setColor(r: number, g: number, b: number, a?: number) {
        this._color.x = r;
        this._color.y = g;
        this._color.z = b;
        a != undefined && (this._color.w = a);
        this._handler && this._handler.setRgbaArr(this._tagData!, this._tagDataIndex, this._color);
    }

    /**
     * Sets color.
     * @public
     * @param {Vec3 | Vec4} color - RGBA vector.
     */
    public setColor4v(color: Vec3 | Vec4) {
        this._color.x = color.x;
        this._color.y = color.y;
        this._color.z = color.z;
        (color as Vec4).w != undefined && (this._color.w = (color as Vec4).w);
        this._handler && this._handler.setRgbaArr(this._tagData!, this._tagDataIndex, this._color);
    }

    /**
     * Sets geo object visibility.
     * @public
     * @param {boolean} visibility - Visibility flag.
     */
    public setVisibility(visibility: boolean) {
        this._visibility = visibility;
        this._handler && this._handler.setVisibility(this._tagData!, this._tagDataIndex, visibility);
    }

    /**
     * Returns geo object visibility.
     * @public
     * @returns {boolean}
     */
    public getVisibility(): boolean {
        return this._visibility;
    }

    /**
     * Sets geo object position.
     * @public
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} z - Z coordinate.
     */
    public setPosition(x: number, y: number, z: number) {
        this._position.x = x;
        this._position.y = y;
        this._position.z = z;
        this.updateRTCPosition();
        this.updateRotation();
    }

    public updateRTCPosition() {
        //Vec3.doubleToTwoFloats(this._position, this._rtcPositionHigh, this._rtcPositionLow);
        if (this._handler) {
            this._handler.getRTCPosition(this._position, this._rtcPositionHigh, this._rtcPositionLow);
            this._handler.setRTCPositionArr(this._tagData!, this._tagDataIndex, this._rtcPositionHigh, this._rtcPositionLow);
        }
    }

    /**
     * Sets geo object position.
     * @public
     * @param {Vec3} position - Cartesian coordinates.
     */
    public setPosition3v(position: Vec3) {
        this.setPosition(position.x, position.y, position.z);
    }

    public setObject(object: Object3d) {
        this._object3d = object;
    }

    public setObjectSrc(src: string) {
        this._objectSrc = src;
        this._handler && this._handler.setObjectSrc(src, this.tag);
    }

    public setColorHTML(color: string) {
        this.setColor4v(utils.htmlColorToRgba(color));
    }

    public setScale(scale: number) {
        this._scale.x = this._scale.y = this._scale.z = scale;
        this._handler && this._handler.setScaleArr(this._tagData!, this._tagDataIndex, this._scale);
    }

    public setScale3v(scale: Vec3) {
        this._scale.copy(scale);
        this._handler && this._handler.setScaleArr(this._tagData!, this._tagDataIndex, scale);
    }

    public getScale(): Vec3 {
        return this._scale;
    }

    public setTranslate3v(translate: Vec3) {
        this._translate.copy(translate);
        this._handler && this._handler.setTranslateArr(this._tagData!, this._tagDataIndex, translate);
    }

    public getTranslate(): Vec3 {
        return this._translate;
    }

    /**
     * Removes geo object from handler.
     * @public
     */
    public remove() {
        this._entity = null;
        this._handler && this._handler.remove(this);
    }

    /**
     * Sets billboard picking color.
     * @public
     * @param {Vec3} color - Picking color.
     */
    public setPickingColor3v(color: Vec3) {
        this._handler && this._handler.setPickingColorArr(this._tagData!, this._tagDataIndex, color);
    }

    public setRotation(qRot: Quat) {
        this._qRot.copy(qRot);
        this._direction = this._qRot.mulVec3(LOCAL_FORWARD).normalize();
        this.updateRotation();
    }

    public getRotation(): Quat {
        return this._qRot;
    }

    public updateRotation() {
        this._handler && this._handler.setQRotArr(this._tagData!, this._tagDataIndex, this._qRot);
    }

    public getDirection(): Vec3 {
        return this._direction.clone();
    }
}

export {GeoObject};
