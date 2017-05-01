let _levels = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    "error": 50,
    fatal: 60
}

let _level = new WeakMap();

class logger {
    constructor() {
        // Default all logging to DEBUG
        this.level = "debug";
    }

    _logResponse(level, details) {
        if (level >= _level.get(this))
            console.log(details);
    }

    set level(val) {
        // Convert string to property
        let minLevel = (typeof val === "string") ? _levels[val] : val;

        _level.set(this, minLevel);
    }

    Trace (err) {
        let self = this;

        self._logResponse(10, err);
    }

    Debug (err) {
        let self = this;

        self._logResponse(20, err);
    }

    Info (err) {
        let self = this;

        self._logResponse(30, err);
    }

    Warn(err) {
        let self = this;

        self._logResponse(40, err);
    }

    Error(err) {
        let self = this;

        self._logResponse(50, err);
    }
}

module.exports = new logger();
