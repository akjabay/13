import {img, Img} from "../assets/gfx";
import {beginRender, draw, drawMeshSprite, flush, gl, setDrawZ, setupProjection} from "../graphics/draw2d";
import {Actor, Particle, TextParticle, Vel} from "./types";
import {addRadialVelocity, addVelFrom, collideWithBounds, copyPosFromActorCenter, updateBody} from "./phy";
import {atan2, cos, hypot, max, min, PI, sin, sqrt} from "../utils/math";
import {_SEEDS, random1, random1i, random1n} from "../utils/rnd";
import {GL} from "../graphics/gl";
import {mapTexture, mapTexture0} from "../assets/map";
import {BOUNDS_SIZE, WORLD_SCALE} from "../assets/params";
import {getLumaColor32, parseRGB, rgb_scale} from "../utils/utils";
import {cubicOut} from "../utils/easing";
import {drawTextShadowCenter, fnt} from "../graphics/font";
import {settings} from "./settings";
import {GAME_CFG} from "./config";

export const newParticle = (): Particle => ({
    x_: 0,
    y_: 0,
    z_: 0,
    u_: 0,
    v_: 0,
    w_: 0,
    a_: 0.0,
    r_: 0.0,
    gravity_: 1.0,
    color_: 0xFFFFFF,
    scale_: 1.0,
    scaleDelta_: 0.0,
    lifeTime_: 0,
    lifeMax_: 600,
    img_: Img.particle_flesh0,
    followVelocity_: 0,
    followScale_: 0.0,
    splashSizeX_: 1.0,
    splashSizeY_: 1.0,
    splashImg_: 0,
    splashEachJump_: 0,
    splashScaleOnVelocity_: 0.0,
    shadowScale: 5.0,
});

const updateParticle = (p: Particle): boolean => {
    p.a_ += p.r_;
    ++p.lifeTime_;

    if (updateBody(p, p.gravity_ * GAME_CFG.world.gravity, 2)) {
        if (p.splashImg_) {
            const v = hypot(p.u_, p.v_, p.w_);
            if (v < 4 || p.splashEachJump_) {
                const d = 1 + p.splashScaleOnVelocity_ * v;
                let angle = p.a_;
                if (p.followVelocity_ > 0) {
                    angle += p.followVelocity_ * atan2(p.v_, p.u_);
                }
                splats.push(p.splashImg_, p.x_ / WORLD_SCALE, p.y_ / WORLD_SCALE, angle, p.splashSizeX_ * d, p.splashSizeY_ * sqrt(d), p.color_);
            }
            if (v < 4) {
                return true;
            }
        }
        p.u_ /= 2;
        p.v_ /= 2;
        p.r_ = -p.r_ / 2;
    }

    collideWithBounds(p, 4, 2);

    return p.lifeTime_ > p.lifeMax_;
}

const updateParticleList = (list: Particle[], i = 0) => {
    for (; i < list.length;) {
        if (updateParticle(list[i++])) {
            list.splice(--i, 1);
        }
    }
}

export function updateParticles() {
    updateParticleList(opaqueParticles);
    //updateParticleList(particles);
    updateTextParticleList(textParticles);
}

let seed0: number;
// let particles0: Particle[];
// let particles: Particle[] = [];
let opaqueParticles0: Particle[];
export let opaqueParticles: Particle[] = [];
let textParticles0: TextParticle[] = [];
export let textParticles: TextParticle[] = [];
export let splats: number[] = [];

export const saveParticles = () => {
    seed0 = _SEEDS[1];
    //particles0 = particles.map(x => ({...x}));
    opaqueParticles0 = opaqueParticles.map(x => ({...x}));
    textParticles0 = textParticles.map(x => ({...x}));
}

export const resetParticles = () => {
    // particles.length = 0;
    opaqueParticles.length = 0;
    textParticles.length = 0;
    splats.length = 0;
}

export const restoreParticles = () => {
    _SEEDS[1] = seed0;
    // particles = particles0;
    opaqueParticles = opaqueParticles0;
    textParticles = textParticles0;
    splats.length = 0;
}

export const drawSplatsOpaque = (list = splats, i = 0) => {
    setDrawZ(0.1);
    for (; i < list.length;) {
        drawMeshSprite(
            img[list[i++]],
            list[i++],
            list[i++],
            list[i++],
            list[i++],
            list[i++],
            1,
            list[i++]
        );
    }
}

export const drawOpaqueParticles = () => {
    for (const p of opaqueParticles) {
        drawParticle(p);
    }
}

const drawListShadows = (particles: Particle[]) => {
    const maxH = 128 * WORLD_SCALE;
    const minH = 1 * WORLD_SCALE;
    for (const p of particles) {
        if (p.z_ > minH && p.z_ < maxH) {
            // if (p.z_ > minH) {//} && p.z_ < maxH) {
            const s = p.shadowScale * (0.5 - p.z_ / maxH);
            const t = (1 - p.lifeTime_ / p.lifeMax_);// * s;
            drawMeshSprite(img[Img.box], p.x_ / WORLD_SCALE, p.y_ / WORLD_SCALE, 0, s, s / 4, 0.4 * t, 0);
        }
    }
}

export const drawParticleShadows = () => {
    drawListShadows(opaqueParticles);
}

export const drawParticle = (p: Particle) => {
    // const velocityScale = max(1, 1 - p.followVelocity_ + p.followScale_ * hypot(p.u_, p.v_, p.w_));
    const velocityScale = max(0, 1 - p.followVelocity_ + p.followScale_ * hypot(p.u_, p.v_, p.w_));
    const velocityAngle = p.followVelocity_ * atan2(p.v_ - p.w_, p.u_);
    const lifeRatio = p.lifeTime_ / p.lifeMax_;
    const scale = p.scale_ + p.scaleDelta_ * (lifeRatio * lifeRatio * lifeRatio);
    const angle = velocityAngle + p.a_;
    setDrawZ(p.z_ / WORLD_SCALE + 0.1);
    drawMeshSprite(img[p.img_], p.x_ / WORLD_SCALE, p.y_ / WORLD_SCALE, angle, scale * velocityScale, scale, 1, p.color_);
}

//////

const KID_MODE_COLORS = [
    parseRGB("#2fff00"),
    parseRGB("#00fff7"),
    parseRGB("#007eff"),
    parseRGB("#8300ff"),
    parseRGB("#ff00ff"),
    parseRGB("#ff4b00"),
    parseRGB("#fffd00"),
];

const MATURE_BLOOD_COLORS = [
    parseRGB("#FF0000"),
];

export const addFleshParticles = (amount: number, actor: Actor, explVel: number, vel?: Vel) => {
    if (!settings.blood) return;
    const colors = settings.blood === 1 ? MATURE_BLOOD_COLORS : KID_MODE_COLORS;
    const idx = actor.id_ ?? random1i(colors.length);
    const color = colors[idx % colors.length];
    amount = (amount * settings.particles) | 0;
    while (amount--) {
        const particle = newParticle();
        copyPosFromActorCenter(particle, actor);
        if (vel) {
            addVelFrom(particle, vel, random1(0.5));
        }
        const v = explVel * sqrt(random1());
        addRadialVelocity(particle, random1n(PI), v, v * cos(random1(PI)));
        particle.v_ /= 2;
        particle.color_ = rgb_scale(color, 0.5 + random1(0.2));
        particle.img_ = Img.particle_shell;
        particle.splashImg_ = Img.circle_4;
        particle.splashEachJump_ = 1;
        particle.splashSizeX_ = 0.5;
        particle.splashSizeY_ = 0.5 / 2;// / 4;
        particle.splashScaleOnVelocity_ = (1 + sqrt(random1())) / 100;
        particle.scale_ = (1 + random1()) / 2;
        particle.followVelocity_ = 1;
        particle.followScale_ = 0.02;
        opaqueParticles.push(particle);
    }
}

export const addBoneParticles = (amount: number, actor: Actor, vel: Vel) => {
    amount = (amount * settings.particles) | 0;
    while (amount--) {
        const particle = newParticle();
        copyPosFromActorCenter(particle, actor);
        if (vel) {
            addVelFrom(particle, vel, random1(0.5));
        }
        addRadialVelocity(particle, random1n(PI), 64 - 128 * sqrt(random1()), random1(128));
        const i = random1() < .3 ? Img.particle_flesh0 : Img.particle_flesh1;
        particle.img_ = i;
        particle.splashImg_ = i;
        particle.scale_ = 0.5 + random1(0.25);
        particle.splashSizeX_ = particle.scale_;
        particle.splashSizeY_ = particle.scale_;
        particle.color_ = getLumaColor32(200 + random1(50));
        particle.r_ = random1n(0.1);
        particle.a_ = random1n(0.5);
        opaqueParticles.push(particle);
    }
}

export const addShellParticle = (player: Actor, offsetZ: number, color: number) => {
    const particle = newParticle();
    particle.x_ = player.x_;
    particle.y_ = player.y_;
    particle.z_ = player.z_ + offsetZ;
    particle.img_ = Img.particle_shell;
    particle.splashImg_ = Img.particle_shell;
    particle.color_ = color;
    particle.r_ = random1n(0.25);
    particle.a_ = random1n(PI);
    addRadialVelocity(particle, random1n(PI), 16 + random1(32), 32);
    opaqueParticles.push(particle);
}

export function addStepSplat(player: Actor, dx: number) {
    splats.push(Img.box,
        (player.x_ + dx) / WORLD_SCALE + random1n(1),
        (player.y_) / WORLD_SCALE + random1n(1),
        0, 1 + random1(), 1, getLumaColor32(0x44 + random1(0x10)));
}

export function addLandParticles(player: Actor, r: number, n: number) {
    while (n--) {
        const particle = newParticle();
        const R = r * sqrt(random1());
        const a = random1n(PI);
        particle.x_ = player.x_ + R * cos(a);
        particle.y_ = player.y_ + R * sin(a);
        particle.z_ = 10;
        particle.img_ = Img.box;
        particle.color_ = getLumaColor32(0x66 + random1(0x22));
        particle.r_ = random1n(0.25);
        particle.a_ = random1n(PI);
        particle.lifeMax_ = 10 + random1i(40);
        particle.gravity_ = -random1(0.1);
        particle.scale_ = 8 * (0.4 + random1(0.5));
        particle.scaleDelta_ = -particle.scale_;
        addRadialVelocity(particle, random1n(PI), 16 + random1(16), 8);
        // particles.push(particle);
        opaqueParticles.push(particle);
    }
}

let mapFadeTime0 = 0;
// draw particles splats and fade map
export const updateMapTexture = (time: number) => {
    const deltaFadeTime = time - mapFadeTime0;
    const MAP_FADE_TIME = 60;
    const MAP_FADE_MIN = 0.1;
    const MAP_FADE_TIME_STEP = MAP_FADE_TIME * MAP_FADE_MIN;
    if (splats.length || deltaFadeTime >= MAP_FADE_TIME_STEP) {
        gl.bindFramebuffer(GL.FRAMEBUFFER, mapTexture.fbo_);
        beginRender();
        setupProjection(
            0, 0,
            0, 1,
            0, 1,
            BOUNDS_SIZE, -BOUNDS_SIZE
        );
        gl.viewport(0, 0, BOUNDS_SIZE, BOUNDS_SIZE);
        gl.scissor(0, 0, BOUNDS_SIZE, BOUNDS_SIZE);
        gl.disable(GL.DEPTH_TEST);
        gl.depthMask(false);
        if (splats.length) {
            drawSplatsOpaque();
            splats.length = 0;
        }
        if (deltaFadeTime >= MAP_FADE_TIME_STEP) {
            draw(mapTexture0, 0, 0, 0, 1, 1, min(1, deltaFadeTime / MAP_FADE_TIME));
            mapFadeTime0 = time;
        }
        flush();
    }
}

export const addImpactParticles = (amount: number, actor: Actor, vel: Vel, colors: number[]) => {
    amount = (amount * settings.particles) | 0;
    while (amount--) {
        const particle = newParticle();
        copyPosFromActorCenter(particle, actor);
        addVelFrom(particle, vel, -random1(0.2));
        addRadialVelocity(particle, random1n(PI), 32 * sqrt(random1()), 0);
        particle.color_ = colors[random1i(colors.length)];
        particle.img_ = Img.box_l;
        particle.scale_ = 1 + random1(1);
        particle.scaleDelta_ = -particle.scale_;
        particle.followVelocity_ = 1;
        particle.followScale_ = 0.02;
        particle.lifeMax_ = 16 + random1(16);
        particle.shadowScale = 0.0;
        opaqueParticles.push(particle);
    }
}

// Text particles

export const newTextParticle = (source: Actor, text: string): TextParticle => ({
    x_: source.x_,
    y_: source.y_,
    z_: source.z_,
    text_: text,
    lifetime_: 3 * 60,
    time_: 0
});

const updateTextParticle = (p: TextParticle): boolean => {
    ++p.time_;
    const t = p.time_ / p.lifetime_;
    return t >= 1;
}

const updateTextParticleList = (list: TextParticle[], i = 0) => {
    for (; i < list.length;) {
        if (updateTextParticle(list[i++])) {
            list.splice(--i, 1);
        }
    }
}

export const addTextParticle = (source: Actor, text: string) => {
    textParticles.push(newTextParticle(source, text));
};

export const drawTextParticles = () => {
    for (const p of textParticles) {
        const t = p.time_ / p.lifetime_;
        if (t > 0.5 && sin(t * 64) > 0.5) {
            continue;
        }
        const x = p.x_ / WORLD_SCALE;
        const offZ = (cubicOut(t) * 60 * WORLD_SCALE) | 0;
        const y = (p.y_ - p.z_ - offZ) / WORLD_SCALE;
        drawTextShadowCenter(fnt[0], p.text_, 8, x, y);
    }
}