// @ts-check
// assume global import esprima from "esprima";
const { parseModule, Program } = esprima;

const { freeze: harden } = Object;

// console.log(process.argv); TODO: get filename from process.argv


/**
 *
 * @param {string} src
 * @param {Writer} out
 */
export function js2rho(src, out) {
    const bld = rhoBuilder();
    const compiler = makeCompiler(bld);

    let indent = 0;
    const printer = harden({
        print(txt) { out.write(txt) },
        begin(txt) { out.write(txt); indent += 1; printer.newline(); },
        newline() { out.write('\n' + '  '.repeat(indent)) },
        end(txt) { printer.newline(); out.write(txt); indent -= 1; printer.newline(); },
    });
    const prog = parseModule(src, { loc: true });
    compiler(prog)._printOn(printer);
}


/**
 * @typedef {Object} Writer
 * @property {(s: string) => void} write
 *
 * @typedef {Object} Miranda
 * @property {(out: Printer) => void} _printOn
 *
 * @typedef {Object} Printer
 * @property {(s: string) => void} print
 * @property {(s: string) => void} begin
 * @property {() => void} newline
 * @property {(s: string) => void} end
 *
 * @typedef {Miranda} Process
 * @property {() => Name} quote
 *
 * @typedef {Object} Name
 * @property {(out: Printer) => void} _printOn
 * @property {() => Process} deref
 */

/**
 * @typedef {"==" | "!="| "and" | "or"| "+"| "*" | "%"| "-" | "/"| "<=" | "<" | ">=" | ">"| "bitand" | "bitor"} BinOp
    // Structurally equivalent processes: "==" | "!="
    // Boolean operators: "and" | "or"
    // Integers, strings, and datetimes: "+"
    // Integers and strings: "*" | "%"
    // Integers: "-" | "/"
    // All ordered types: "<=" | "<" | ">=" | ">"
    // Bitfields: "bitand" | "bitor"
 *
 * @typedef {'bundle+'} UnOp
 * // TODO: types, iopairs
 * @typedef {string | [string, string]} vdecl
 */


/**
 * https://github.com/rchain/rchain/blob/dev/rholang/src/main/bnfc/rholang_mercury.cf
 *
 * @typedef {Object} RhoBuilder is a thingy
 * @property {() => Process} Nil
 * @property {(v: boolean | number | string) => Process} primitive
 * @property {(procs: Process[]) => Process} listExpr
 * @property {(procs: Process[]) => Process} tupleExpr
 * @property {(entries: Array<{ key: string, value: Process }>) => Process} mapExpr
 * @property {(specimen: Process, cases: { lhs: Process, rhs: Process }) => Process } match
 * @property {(dest: Name, procs: Array<Process>) => Process} send
 * @property {(op: BinOp, lhs: Process, rhs: Process) => Process} binop
 * @property {(op: UnOp, arg: Process) => Process} unary
 * @property {(rx: Receipt, proc: Process) => Process} receiving
 * @property {(name: Name, args: Array<Name>, body: Process) => Process} contract
 * @property {(n: Name) => Process} Drop
 * @property {(p: Process, q: Process) => Process} Par
 * @property {(id: string) => Name} Var
 * @property {(p: Process) => Name} Quote
 * @property {(vars: Array<vdecl>, body: Process) => Process} new_
 *
 * @typedef {{ lhs: Name[], rhs: Name}[]} Receipt
 */

/**
 * @returns {RhoBuilder}
 */
export function rhoBuilder() {
    const aNil = () => harden({
        _printOn: (out) => out.print("Nil"),
        quote: () => Quote(aNil())
    });
    const theNil = aNil();
    const Nil = () => theNil;

    const primitive = (v) => harden({
        _printOn: (out) => out.print(JSON.stringify(v)),
        quote: () => Quote(primitive(v))
    });
    const listExpr = (procs) => harden({
        _printOn(out) {
            out.print('[');
            printList(out, procs);
            out.print(']');
        },
        quote: () => Quote(listExpr(procs))
    });
    const tupleExpr = (procs) => harden({
        _printOn(out) {
            out.print('(');
            printList(out, procs);
            out.print(')');
        },
        quote: () => Quote(tupleExpr(procs))
    });
    const mapExpr = (entries) => harden({
        _printOn(out) {
            let first = true;
            out.print('{');
            for (const { key, value } of entries) {
                if (!first) {
                    out.print(', ')
                }
                out.print(JSON.stringify(key));
                out.print(': ');
                value._printOn(out);
                first = false;
            }
            out.print('}');
        },
        quote: () => Quote(mapExpr(entries))
    });
    const match = (specimen, cases) => harden({
        _printOn(out) {
            out.newline();
            out.print("match (");
            specimen._printOn(out);
            out.begin(") {");
            for (const { lhs, rhs } of cases) {
                lhs._printOn(out);
                out.begin(" => {");
                rhs._printOn(out);
                out.end("}");
            }
            out.end("}");
        }

    });
    const Quote = (p) => harden({
        _printOn: (out) => {
            out.print("@{ ");
            p._printOn(out)
            out.print(" }")
        },
        deref: () => p
    });
    const Drop = (name) => harden({
        _printOn: (out) => {
            out.print("*");
            name._printOn(out)
        },
        quote: () => name
    });
    const printList = (out, items) => {
        let first = true;
        for (const item of items) {
            if (!first) {
                out.print(", ")
            }
            item._printOn(out)
            first = false
        }
    }
    const send = (dest, procs) => harden({
        _printOn: (out) => {
            dest._printOn(out)
            out.print(`!(`)  // TODO: !!
            printList(out, procs)
            out.print(")")
        },
        quote: () => Quote(send(dest, procs))
    });
    const binop = (op, lhs, rhs) => harden({
        _printOn: (out) => {
            lhs._printOn(out)
            out.print(" " + op + " ")
            rhs._printOn(out)
        },
        quote: () => Quote(binop(op, lhs, rhs))
    })
    const unary = (op, arg) => harden({
        _printOn: (out) => {
            out.print(op);
            out.print('{');
            arg._printOn(out);
            out.print('}')
        },
        quote: () => Quote(unary(op, arg))
    })
    const receiving = (rx, proc) => harden({
        _printOn: (out) => {
            out.print("for(")
            let first = true;
            for (const { lhs, rhs } of rx) {
                if (!first) {
                    out.print("; ");
                }
                printList(out, lhs)
                out.print(` <- `)
                rhs._printOn(out)
                first = false;
            }
            out.begin(`) {`)
            proc._printOn(out)
            out.end("}")
        },
        quote: () => Quote(receiving(rx, proc))
    })
    const contract = (name, args, body) => harden({
        _printOn: (out) => {
            out.print("contract ")
            name._printOn(out)
            out.print(`(`)
            printList(out, args)
            out.begin(`) = {`);
            body._printOn(out);
            out.end("}")
        },
        quote: () => Quote(contract(name, args, body))
    })
    const Par = (p, q) => p === theNil ? q : q === theNil ? p : harden({
        _printOn: (out) => {
            p._printOn(out);
            out.newline();
            out.print("|");
            out.newline();
            q._printOn(out);
        },
        quote: () => Quote(Par(p, q))
    });
    const Var = (v) => harden({
        _printOn: (out) => out.print(v),
        deref: () => Drop(Var(v))
    })

    const fmtvdecl = (vd) => typeof vd === 'string' ? vd : `${vd[0]}(\`${vd[1]}\`)`;
    /** @type {(vlist: vdecl[], body: Process) => Process} */
    const new_ = (vlist, body) => harden({
        _printOn: (out) => {
            out.newline();
            out.print("new ")
            let first = true;
            for (const item of vlist) {
                if (!first) {
                    if (typeof item === 'string') {
                        out.print(', ');
                    } else {
                        out.print(',');
                        out.newline();
                    }
                }
                out.print(fmtvdecl(item));
                first = false;
            }
            out.newline();
            out.begin("in {")
            body._printOn(out)
            out.end("}");
        },
        quote: () => Quote(new_(vlist, body))
    })

    return harden({
        Nil,
        primitive,
        listExpr,
        tupleExpr,
        mapExpr,
        match,
        send,
        binop,
        unary,
        receiving,
        contract,
        Drop,
        Var,
        Quote,
        Par,
        new_,
    });
}

export const builtins = {
    '@rchain-community/js2rho': ['bundlePlus', 'tuple', 'console'],
    '@agoric/nat': ['Nat'],
    '@agoric/harden': ['harden'],
    '@agoric/eventual-send': ['E'],
};
/** type: {vdecl} */
const rhoConsole = ['console', 'rho:io:stdout'];


function jsontrim(obj, maxlen = 80) {
    return JSON.stringify(obj).slice(0, maxlen);
}

//throw new Error(`${loc(defaultExport)}: expected default export; found ${defaultExport.type}`);


/**
 *
 * @param {RhoBuilder} bld
 * @returns {(js: Program) => Process}
 */
export function makeCompiler(bld) {
    const loc = (n) => `${n.loc.start.line}c${n.loc.start.column}`
    let tmp_ix = 0;
    const fresh = (n) => `${n.type}_${loc(n)}_${tmp_ix++}`

    function todowarn(expectedType, actual) {
        console.warn(`${loc(actual)}: expected ${expectedType}; found ${actual.type}`);
        return bld.primitive('TODO@@ ' + actual.type);
    }

    function todoerr(expectedType, actual) {
        return new Error(`${loc(actual)}: expected ${expectedType}; found ${actual.type}`);
    }

    /** @type {(n: string) => Name} */
    const vn = (n) => bld.Var(n)
    const ignore = vn("_")  // TODO: this is a pattern, not a name, no?

    /** @type {(ps: Process[] ) => Process } */
    const par = (ps) => ps.reduce((acc, next) => bld.Par(acc, next));

    function theLiteral(js) {
        if (js.type !== 'Literal') {
            throw todoerr('Literal', js);
        }
        return js.value;
    }

    /**
     *
     * @param {(import ('estree').Node)[]} body
     */
    function ofProgram(body) {
        console.log({ Program: body.length });
        if (body.length === 0) {
            return bld.Nil();
        }

        /** @type {vdecl[]} */
        const newNames = [];
        /** @type {(import ('estree').Node)} */
        let decl;
        while ((decl = body[0]) && decl.type === 'ImportDeclaration') {
            const specifier = theLiteral(decl.source);
            if (typeof specifier === 'string' && specifier.startsWith('rho:')) {
                if (decl.specifiers.length !== 1) {
                    throw new Error(`must import default from ${specifier}`);
                }
                newNames.push([decl.specifiers[0].local.name, specifier]);
            } else {
                const candidates = builtins[specifier];
                if (!candidates) {
                    throw new Error(`not supported: import ... from ${specifier}`);
                }
                const unknowns = decl.specifiers.map(s => s.local.name).filter(n => !candidates.includes(n));
                if (unknowns.length > 0) {
                    throw new Error(`unrecognized name(s) ${unknowns} from ${specifier}`);
                }
            }
            body.shift();
        };
        // console.log('new names', newNames);
        if (body.length === 0) {
            return bld.Nil();
        }
        const s0 = body[0];
        if (s0.type === 'ExportDefaultDeclaration') {
            const fn0 = s0.declaration;
            if (fn0.type !== 'FunctionDeclaration') {
                throw todoerr('FunctionDeclaration', fn0);
            }
            const main = bld.new_([...newNames, rhoConsole], ofBlock(fn0.body.body));
            if (body.length > 1) {
                throw todoerr('last', fn0);
            }
            return main;
        }
        return bld.new_([...newNames, rhoConsole], ofBlock(body));
    }

    function ofBlock(js) {
        function recur(body) {
            if (body.length === 0) {
                return bld.Nil();
            }
            const [s0, ...rest] = body;
            switch (s0.type) {
                case 'VariableDeclaration':
                    const decl = theDecl(s0);
                    switch (decl.init.type) {
                        case 'AwaitExpression':
                            const { chans, rx, proc } = await2for(decl);
                            const restProc = recur(rest);
                            return bld.new_(chans, bld.Par(proc, bld.receiving(rx, restProc)));
                        case 'ObjectExpression':
                            if (decl.init.properties.length !== 0) {
                                throw todoerr('{}', decl.init);
                            }
                            return bld.new_([decl.id.name], recur(rest));
                        case 'CallExpression':
                            if (decl.init.callee.type !== 'Identifier') {
                                throw todoerr('Identifier', decl.init.callee);
                            }
                            if (decl.init.callee.name !== 'harden') {
                                throw todoerr('harden', decl.init.callee);
                            }
                            const { target, methods } = ofMethodSuite(decl);
                            return bld.new_([target], par([...methods, recur(rest)]));
                        case 'Literal':
                            return bld.match(toProc(decl.init), [{ lhs: bld.Drop(vn(decl.id.name)), rhs: recur(rest) }]);
                        default:
                            return bld.Par(todowarn('{} | AwaitExpression | harden({...} | Literal)', decl.init), recur(rest));
                    }
                case 'ExpressionStatement':
                    try {
                        const { arg } = matchConsoleLog(s0.expression);
                        // TODO: stdoutack, sequence statements
                        return bld.Par(bld.send(vn('console'), [toProc(arg)]), recur(rest));
                    } catch (notConsoleLog) {
                        const { target, method, args } = matchEventualCall(s0.expression);
                        // send only; no return channel
                        const procs = args.map(toProc);
                        if (method === null) {
                            return bld.send(vn(target), procs);
                        } else {
                            return bld.send(vn(target), [bld.primitive(method), ...procs]);
                        }
                    }
                case 'SwitchStatement':
                    const specimen = toProc(s0.discriminant);
                    const cases = s0.cases.map(({ test, consequent }) => {
                        const lhs = toProc(test);
                        const rhs = ofBlock(consequent);
                        return { lhs, rhs };
                    });
                    return bld.Par(bld.match(specimen, cases), recur(rest));
                case 'ReturnStatement':
                    const retProc = toProc(s0.argument);
                    return bld.send(vn('__return'), [retProc]);
                default:
                    return todowarn('VariableDeclaration', s0);
            }
        }
        return recur(js);
    }

    function matchConsoleLog(js) {
        if (js.type !== 'CallExpression'
            || js.callee.type !== 'MemberExpression'
            || js.callee.object.name !== 'console'
            || js.callee.property.name !== 'log'
            || js.arguments.length !== 1) {
            throw todoerr('console.log(...1 arg...)', js);
        }
        const arg = js.arguments[0];
        return { arg };
    }

    function theDecl(js) {
        if (js.kind !== 'const') {
            throw todoerr('const', js);
        }
        if (js.declarations.length !== 1) {
            throw todoerr('1 declaration', js);
        }
        const decl = js.declarations[0];
        if (decl.type !== "VariableDeclarator") {
            throw todoerr('VariableDeclarator', decl);
        }
        return decl;
    }

    function ofMethodSuite(decl) {
        const target = decl.id.name;
        const rhs = decl.init;
        if (rhs.arguments.length !== 1) {
            throw todoerr('harden(1 arg)', decl.init);
        }
        const objectLiteral = rhs.arguments[0];
        if (objectLiteral.type !== 'ObjectExpression') {
            throw todoerr('ObjectExpression', objectLiteral);
        }
        const returnChans = params => params.map(p => p.name).includes('__return') ? [] : [vn('__return')];
        const methods = objectLiteral.properties.map(
            ({ key, value }) => bld.contract(vn(target),
                [bld.Quote(bld.primitive(key.name)), ...value.params.map(p => vn(p.name)), ...returnChans(value.params)],
                ofBlock(value.body.body))
        );
        return { target, methods };
    }

    function await2for(decl) {
        const rhs = decl.init;
        if (rhs.type !== 'AwaitExpression') {
            throw todoerr('AwaitExpression', rhs);
        }
        const expr = rhs.argument;
        if (expr.type === 'CallExpression'
            && expr.callee.type === 'MemberExpression'
            && expr.callee.object.name === 'Promise') {
            const { chans, proc } = ofPromiseAll(rhs.argument);
            const patts = ofArrayPattern(decl.id);
            if (chans.length !== patts.length) {
                throw new Error(`Promise.all mismatch: ${chans.length} expressions to ${patts.length} channels`);
            }
            const rx = patts.map((lhs, ix) => ({ lhs: [lhs], rhs: vn(chans[ix]) }));
            return { chans, proc, rx }
        } else {
            const chan = fresh(rhs);
            const proc = ofEventualCall(expr, chan);
            const lhs = ofPattern(decl.id);
            return { chans: [chan], proc, rx: [{ lhs: [lhs], rhs: vn(chan) }] };
        }
    }

    /**
     *
     * @returns {Name}
     */
    function ofPattern(js) {
        switch (js.type) {
            case 'Identifier':
                return vn(js.name);
            case 'ObjectPattern':
                const unk = js.properties.filter(({ key }, ix) => key.name !== `_${ix}`);
                if (unk.length > 0) {
                    throw todoerr('tuple pattern { _0: ..., _1: ..., _2: ..., ... ', js);
                }
                const parts = js.properties.map(({ value }) => toProc(value));
                return bld.Quote(bld.tupleExpr(parts));
            default:
                throw todoerr('Identifier | ObjectPattern', js);
        }

    }
    /**
     * @returns {Name[]}
     */
    function ofArrayPattern(js) {
        if (js.type !== "ArrayPattern") {
            throw todoerr('ArrayPattern', js);
        }
        return js.elements.map(ofPattern);
    }

    /**
     * Make Par from await Promise.all
     * @returns { { chans: string[], proc: Process }}
     */
    function ofPromiseAll(js) {
        if (js.type !== "CallExpression") {
            throw todoerr('CallExpression', js);
        }
        if (js.callee.type !== 'MemberExpression' ||
            js.callee.object.name !== 'Promise' ||
            js.callee.property.name !== 'all') {
            throw todoerr('Promise.all', js.callee);
        }
        if (js.arguments.length !== 1 ||
            js.arguments[0].type !== 'ArrayExpression') {
            throw todoerr('ArrayExpression[1]', js.arguments);
        }
        const items = js.arguments[0].elements;
        const chans = items.map(fresh);
        const procs = items.map((expr, ix) => ofEventualCall(expr, chans[ix]));
        return { chans, proc: par(procs) };
    }

    function ofEventualCall(js, k) {
        const { target, method, args } = matchEventualCall(js);
        const procs = [...args.map(toProc), bld.Drop(vn(k))];
        if (method === null) {
            return bld.send(vn(target), procs);
        } else {
            return bld.send(vn(target), [bld.primitive(method), ...procs]);
        }
    }
    function matchEventualCall(js) {
        if (js.type !== 'CallExpression') {
            throw todoerr('CallExpression', js);
        }
        const { target, method } = matchEventualTarget(js.callee);
        return { target, method, args: js.arguments };
    }
    function matchEventualTarget(js) {
        switch (js.type) {
            case 'CallExpression':
                return { target: matchE(js), method: null };
            case 'MemberExpression':
                return { target: matchE(js.object), method: js.property.name };
            default:
                throw todoerr('CallExpression | MemberExpression', js);
        }
    }
    function matchE(js) {
        if (js.callee.name !== 'E') {
            throw todoerr('E(...)', js);
        }
        if (js.arguments.length != 1) {
            throw todoerr('E(_1 arg_)', js);
        }
        const target = js.arguments[0];
        if (target.type !== 'Identifier') {
            throw todoerr('Identifier', target);
        }
        return target.name;
    }

    function toProc(js) {
        switch (js.type) {
            case "Literal":
                const v = js.value
                if (typeof (v) == "object") {
                    if (v === null) {
                        return bld.Nil();
                    }
                    throw (typeof v)  // TODO: RegExp?
                }
                return bld.primitive(v);
            case 'Identifier':
                return bld.Drop(vn(js.name));
            case 'LogicalExpression':
            case 'BinaryExpression':
                let op = { '&&': 'and', '||': 'or', '===': '==' }[js.operator];
                if (!op) {
                    throw todoerr('&& || ===', js);
                }
                return bld.binop(op, toProc(js.left), toProc(js.right));
            case 'CallExpression':
                if (js.callee.type !== 'Identifier') {
                    throw todoerr('Identifier', js.callee);
                }
                const arg = js.arguments[0];
                switch (js.callee.name) {
                    case 'bundlePlus':
                        if (js.arguments.length !== 1) {
                            throw todoerr('BUILTIN(...1 arg...)');
                        }
                        return bld.unary('bundle+', toProc(arg))
                    case 'tuple':
                        return bld.tupleExpr(js.arguments.map(toProc));
                    default:
                        throw todoerr('bundlePlus', js);
                }
            case 'ObjectExpression':
                const entries = js.properties.map(({ key, value }) =>
                    // TODO: theLiteral
                    ({ key: key.value, value: toProc(value) })
                );
                return bld.mapExpr(entries);
            default:
                throw todoerr('Literal | Identifier', js);
        }
    }

    /** @type {(js: Program) => Process} */
    function compiler(js) {
        // console.log("DEBUG: node:", JSON.stringify(js));
        console.log("DEBUG: js.type", js.type);

        switch (js.type) {
            case "ExpressionStatement":
                return toProc(js.expression);

            case "BlockStatement":
                if (js.body.length == 1) {
                    return js2rho(js.body[0])
                }
                return ofBlock(js.body)
            case "Program":
                return ofProgram(js.body);
            default:
                return todowarn('Literal | ExpressionStatement | BlockStatemnt | Program', js);
        }
    }
    return compiler;
}
