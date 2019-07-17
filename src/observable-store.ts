import { BehaviorSubject, Observable } from 'rxjs';
import { produce, setAutoFreeze } from "immer";

export interface ObservableStoreSettings {
    trackStateHistory?: boolean;
    logStateChanges?: boolean;
    includeStateChangesOnSubscribe?: boolean;
    stateSliceSelector?: (state: any) => any;
}

export interface CurrentStoreState {
    state: any;
    stateChanges: any;
}

// static objects
let storeState: Readonly<any> = null;
let stateHistory: any[] = [];
const settingsDefaults: ObservableStoreSettings = {
    trackStateHistory: false,
    logStateChanges: false,
    includeStateChangesOnSubscribe: false,
    stateSliceSelector: null
};
const globalStateDispatcher = new BehaviorSubject<any>(null);

/**
 * Executes a function on `state` and returns a version of T
 * @param state - the original state model
 */
export type stateFunc<T> = (state: T) => Partial<T>;

export class ObservableStore<T> {
    // Not a fan of using _ for private fields in TypeScript, but since 
    // some may use this as pure ES6 I'm going with _ for the private fields.
    // stateChanged is for changes to a slice of state managed by a particular service
    public stateChanged: Observable<any>;
    public stateHistory: any[];
    public globalStateChanged: Observable<any>;

    private _stateDispatcher = new BehaviorSubject<any>(null);
    private _settings: ObservableStoreSettings

    constructor(settings: ObservableStoreSettings) {
        // disable immer auto freeze
        setAutoFreeze(false);
        // this._settings = Object.assign({}, settingsDefaults, settings);
        this._settings = produce(Object.assign)({}, settingsDefaults, settings);

        this.stateChanged = this._stateDispatcher.asObservable();
        this.stateHistory = stateHistory;
        this.globalStateChanged = globalStateDispatcher.asObservable();
    }

    protected setState(state: Partial<T> | stateFunc<T>, action?: string, dispatchState: boolean = true): T {
        // Needed for tracking below
        const previousState = this.getState();

        if (typeof state === 'function') {
            const newState = state(this.getState());
            this._updateState(newState);
        }
        else if (typeof state === 'object') {
            this._updateState(state);
        }
        else {
            throw Error('Pass an object or a function for the state parameter when calling setState().');
        }

        if (dispatchState) {
            this._dispatchState(state as any);
        }

        if (this._settings.trackStateHistory) {
            this.stateHistory.push({
                action,
                beginState: previousState,
                endState: produce(this.getState(), draftState => { })
            });
        }

        if (this._settings.logStateChanges) {
            const caller = (this.constructor) ? '\r\nCaller: ' + this.constructor.name : '';
            console.log('%cSTATE CHANGED', 'font-weight: bold', '\r\nAction: ', action, caller, '\r\nPreviousState: ', previousState, '\r\nNewState: ', state);
        }

        return this.getState();
    }

    protected getState(): T {
        const stateOrSlice = this._getStateOrSlice(storeState);
        return produce(stateOrSlice, draftState => { }) as T;
    }

    protected logStateAction(state: any, action: string) {
        if (this._settings.trackStateHistory) {
            this.stateHistory.push({ action, state: produce(state, draftState => { }) });
        }
    }

    private _updateState(state: Partial<T>) {
        // storeState = (state) ? Object.assign({}, storeState, state) : null;
        storeState = (state) ? produce(Object.assign)({}, storeState, state) : null;
    }

    private _getStateOrSlice(state: Readonly<any>): Readonly<any> {
        if (this._settings.stateSliceSelector) {
            return this._settings.stateSliceSelector(storeState);
        }
        return storeState;
    }

    private _dispatchState(stateChanges: T) {
        const stateOrSlice = this._getStateOrSlice(storeState);

        if (this._settings.includeStateChangesOnSubscribe) {
            this._stateDispatcher.next(produce(stateOrSlice, draftState => { return stateChanges }));
            globalStateDispatcher.next(produce(storeState, draftState => { return stateChanges }));
        }
        else {
            this._stateDispatcher.next(produce(stateOrSlice, draftState => { }));
            globalStateDispatcher.next(produce(storeState, draftState => { }));
        }
    }
}
