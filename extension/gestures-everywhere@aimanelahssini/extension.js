// GNOME 50's TouchpadSwipeGesture listens on the stage's bubble phase
// ('event::touchpad'), so an app under the pointer that consumes 3-finger swipes
// (Firefox does) gets them first and the system gestures never fire. This moves
// the workspace and overview gestures to the capture phase, which their
// SwipeTrackers already ask for.
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class GesturesEverywhereExtension extends Extension {
    enable() {
        this._gestures = [
            Main.wm._workspaceAnimation?._swipeTracker?._touchpadGesture,
            Main.overview._swipeTracker?._touchpadGesture,
        ].filter(g => g?._handleEvent);

        for (const g of this._gestures)
            global.stage.disconnectObject(g);

        this._captureId = global.stage.connect('captured-event', (actor, event) => {
            if (event.type() !== Clutter.EventType.TOUCHPAD_SWIPE)
                return Clutter.EVENT_PROPAGATE;
            for (const g of this._gestures) {
                if (g._handleEvent(actor, event) === Clutter.EVENT_STOP)
                    return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    disable() {
        if (this._captureId)
            global.stage.disconnect(this._captureId);
        this._captureId = null;
        for (const g of this._gestures ?? [])
            global.stage.connectObject('event::touchpad', g._handleEvent.bind(g), g);
        this._gestures = null;
    }
}
