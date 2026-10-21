// Two fixes so GNOME's 3-finger touchpad gestures (switch desktop, overview) work everywhere:
//
// 1. GNOME 50's TouchpadSwipeGesture listens on the stage's bubble phase ('event::touchpad'),
//    so an app under the pointer that consumes 3-finger swipes (Firefox does) gets them first
//    and the system gestures never fire. The workspace and overview gestures are moved to the
//    capture phase, which their SwipeTrackers already ask for.
// 2. While a menu is open (Quick Settings, calendar, app menus) it grabs all input and GNOME
//    pauses its gestures. A 3-finger swipe on an open menu now closes it and carries on as
//    the gesture, like it would with no menu open.
import Clutter from 'gi://Clutter';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const FINGERS = 3;

export default class GesturesEverywhereExtension extends Extension {
    enable() {
        this._gestures = [
            Main.wm._workspaceAnimation?._swipeTracker?._touchpadGesture,
            Main.overview._swipeTracker?._touchpadGesture,
        ].filter(g => g?._handleEvent);

        for (const g of this._gestures)
            global.stage.disconnectObject(g);

        this._captureId = global.stage.connect('captured-event', (actor, event) => this._feed(event));

        // Watch every popup menu while it's open (its actor holds the input grab).
        const self = this;
        const proto = PopupMenu.PopupMenu.prototype;
        this._origOpen = proto.open;
        this._origClose = proto.close;
        proto.open = function (...args) {
            self._origOpen.apply(this, args);
            if (!this._gesturesEverywhereId && this.actor) {
                this._gesturesEverywhereId = this.actor.connect('captured-event',
                    (actor, event) => self._onMenuEvent(this, event));
            }
        };
        proto.close = function (...args) {
            if (this._gesturesEverywhereId) {
                this.actor?.disconnect(this._gesturesEverywhereId);
                delete this._gesturesEverywhereId;
            }
            self._origClose.apply(this, args);
        };
    }

    disable() {
        if (this._captureId)
            global.stage.disconnect(this._captureId);
        this._captureId = null;
        for (const g of this._gestures ?? [])
            global.stage.connectObject('event::touchpad', g._handleEvent.bind(g), g);
        this._gestures = null;

        const proto = PopupMenu.PopupMenu.prototype;
        if (this._origOpen) {
            proto.open = this._origOpen;
            proto.close = this._origClose;
        }
        this._origOpen = this._origClose = null;
    }

    _feed(event) {
        if (event.type() !== Clutter.EventType.TOUCHPAD_SWIPE)
            return Clutter.EVENT_PROPAGATE;
        for (const g of this._gestures) {
            if (g._handleEvent(global.stage, event) === Clutter.EVENT_STOP)
                return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onMenuEvent(menu, event) {
        if (event.type() !== Clutter.EventType.TOUCHPAD_SWIPE ||
            event.get_touchpad_gesture_finger_count() < FINGERS)
            return Clutter.EVENT_PROPAGATE;
        // Closing ends the menu's grab and puts GNOME back in normal mode; the rest of the
        // swipe then reaches the stage as usual.
        menu.close(BoxPointer.PopupAnimation.NONE);
        return this._feed(event);
    }
}
