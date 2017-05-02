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

    _logResponse(level, dataToDisplay) {
        if (level >= _level.get(this))
            dataToDisplay.forEach((details) => { console.log(details); });
    }

    set level(val) {
        // Convert string to property
        let minLevel = (typeof val === "string") ? _levels[val].toLowerCase() : val;

        _level.set(this, minLevel);
    }

    Trace () {
        let self = this;

        let dataDisplay = [];
        for (let idx = 0, total = arguments.length; idx < total; idx++)
            dataDisplay.push(arguments[idx]);

        self._logResponse(10, dataDisplay);
    }

    Debug () {
        let self = this;

        let dataDisplay = [];
        for (let idx = 0, total = arguments.length; idx < total; idx++)
            dataDisplay.push(arguments[idx]);

        self._logResponse(20, dataDisplay);
    }

    Info () {
        let self = this;

        let dataDisplay = [];
        for (let idx = 0, total = arguments.length; idx < total; idx++)
            dataDisplay.push(arguments[idx]);

        self._logResponse(30, dataDisplay);
    }

    Warn() {
        let self = this;

        let dataDisplay = [];
        for (let idx = 0, total = arguments.length; idx < total; idx++)
            dataDisplay.push(arguments[idx]);

        self._logResponse(40, dataDisplay);
    }

    Error() {
        let self = this;

        let dataDisplay = [];
        for (let idx = 0, total = arguments.length; idx < total; idx++)
            dataDisplay.push(arguments[idx]);

        self._logResponse(50, dataDisplay);
    }
}

module.exports = new logger();
