import {ClientID} from "../../shared/types";
import {DEBUG_LAG_ENABLED, DebugLag} from "../game/config";

// round-trip
const lagMin = DebugLag.LagMin / 2;
const lagMax = DebugLag.LagMax / 2;
const packetLoss = DebugLag.PacketLoss;
const sendLagMin = lagMin / 2;
const sendLagMax = lagMax / 2;
const sendPacketLoss = packetLoss * packetLoss;
const receiveLagMin = lagMin / 2;
const receiveLagMax = lagMax / 2;
const receivePacketLoss = packetLoss * packetLoss;

function chance(prob: number): boolean {
    return Math.random() < prob;
}

function range(min: number, max: number): number {
    return min + (max - min) * Math.random();
}

type RTMessageHandler = (from: ClientID, data: ArrayBuffer) => void;
let onRTMessage: RTMessageHandler = () => {
};

export function setRTMessageHandler(handler: RTMessageHandler) {
    onRTMessage = handler;
}

export function channels_sendObjectData(dc: RTCDataChannel, data: ArrayBuffer) {
    if (DEBUG_LAG_ENABLED) {
        if (data.byteLength >= 1200 / 2) {
            throw new Error("HUGE packet could not be delivered");
        }
        if (!chance(sendPacketLoss)) {
            if (document.hidden) {
                // can't simulate lag when tab in background because of setTimeout stall
                dc.send(data);
            } else {
                setTimeout(() => {
                    if (dc.readyState === "open") {
                        dc.send(data);
                    }
                }, range(sendLagMin, sendLagMax));
            }
        }
        return;
    }
    dc.send(data);
}

export function channels_processMessage(from: ClientID, msg: MessageEvent<ArrayBuffer>) {
    const data = msg.data;
    if (DEBUG_LAG_ENABLED) {
        if (!chance(receivePacketLoss)) {
            if (document.hidden) {
                // can't simulate lag when tab in background because of setTimeout stall
                onRTMessage(from, data);
            } else {
                setTimeout(() => onRTMessage(from, data), range(receiveLagMin, receiveLagMax));
            }
        }
        return;
    }
    onRTMessage(from, data)
}
