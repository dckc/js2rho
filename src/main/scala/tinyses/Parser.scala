/**
  * based on https://github.com/Agoric/TinySES/blob/master/src/tinyses.js
  */

package com.madmode.tinyses

import scala.util.parsing.combinator._

sealed trait Expression

sealed trait DataLiteral extends Expression
sealed trait BooleanLiteral extends DataLiteral
case object Null extends DataLiteral
case object True extends BooleanLiteral
case object False extends BooleanLiteral
case class Number(value: Double) extends DataLiteral
case class StrLit(value: String) extends DataLiteral

case class Def(id: String) extends Expression
case class Use(id: String) extends Expression

case class ArrayExpr(items: Expression*) extends Expression
case class ObjectExpr(properties: Property*) extends Expression
case class Spread(items: Expression*) extends Expression

sealed trait Property
case class Prop(k: PropName, e: Expression) extends Property
case class SpreadObj(e: Expression) extends Property

sealed trait PropName
case class PropKey(k: String) extends PropName
case class PropIx(ix: Double) extends PropName

// ISSUE: use JavaTokenParsers instead?
class JSONTokens extends RegexParsers {
  override def skipWhitespace = true
  override val whiteSpace = raw"\s+".r
  def NUMBER: Parser[Double] = raw"-?\d+(?:\.\d+)?(?:[eE]-?\d+)?".r ^^ { n => n.toDouble }
  val UCODE_RE = raw"\\u[\da-fA-F]{4}"
  // Note no \' (escaped single quote) in accord with JSON.
  // TODO: val CHAR_RE = r"[^\"\\]|\\"|\\\\|\\/|\\b|\\f|\\n|\\r|\\t|" // TODO: + UCODE_RE
  // TODO: def STRING: Parser[String] = s"\"${CHAR_RE}*\"".r
  def STRING: Parser[String] = "\"[^\"]*\"".r
  def IDENT: Parser[String] = raw"[a-zA-Z_$$][\w$$]*".r
}

class TinySESParser extends JSONTokens {
  // TODO: def start: Parser[_] = phrase(body)

  // TODO: Error if whitespace includes newline
  // def NO_NEWLINE

  // TODO: quasiliterals aka template literals
  //  QUASI_ALL ::= ${() => FAIL};
  //  QUASI_HEAD ::= ${() => FAIL};
  //  QUASI_MID ::= ${() => FAIL};
  //  QUASI_TAIL ::= ${() => FAIL};

  // Omit "async", "arguments", and "eval" from IDENT in TinySES even
  // though ES2017 considers them in IDENT.
  def RESERVED_WORD: Parser[String] = (
    KEYWORD | RESERVED_KEYWORD | FUTURE_RESERVED_WORD
      | "null" | "false" | "true"
      | "async" | "arguments" | "eval"
  )

  def KEYWORD: Parser[String] = (
    "break"
      | "case" | "catch" | "const" | "continue"
      | "debugger" | "default"
      | "else" | "export"
      | "finally" | "for" | "function"
      | "if" | "import"
      | "return"
      | "switch"
      | "throw" | "try" | "typeof"
      | "void"
      | "while"
  )

  // Unused by TinySES but enumerated here, in order to omit them
  // from the IDENT token.
  def RESERVED_KEYWORD: Parser[String] = (
    "class"
      | "delete" | "do"
      | "extends"
      | "in" | "instanceof"
      | "new"
      | "super"
      | "this"
      | "var"
      | "with"
      | "yield"
  )

  def FUTURE_RESERVED_WORD: Parser[String] = (
    "await" | "enum"
      | "implements" | "package" | "protected"
      | "interface" | "private" | "public"
  )

  def dataLiteral: Parser[DataLiteral] =  (
    "null"        ^^ { _ => Null }
      | "false"   ^^ { _ => False }
      | "true"    ^^ { _ => True }
      | NUMBER    ^^ { Number(_) }
      | STRING    ^^ { StrLit(_) }
  )

  def identName = IDENT | RESERVED_WORD
  def useVar = IDENT                    ^^ { Use(_) }
  def defVar = IDENT                    ^^ { Def(_) }

  // For most identifiers that ES2017 treats as IDENT but recognizes
  // as pseudo-keywords in a context dependent manner, TinySES simply makes
  // keywords. However, this would be too painful for "get" and
  // "set", so instead we ???use our parser-generator's support syntactic
  // predicates. TODO: Is it really too painful? Try it.
  // identGet ::= IDENT ^^ { id => if (id == "get") { id } else { FAIL }}
  // identSet ::= IDENT ^^ { id => if (id == "set") { id } else { FAIL }}
  def identGet: Parser[String] = "get"
  def identSet: Parser[String] = "set"

  // TinySES primaryExpr does not include "this", ClassExpression,
  // GeneratorExpression, or RegularExpressionLiteral.
  def primaryExpr: Parser[Expression] = (
    dataLiteral
      | "[" ~> repsep(arg, ",")  <~ "]"   ^^ { args => ArrayExpr(args:_*) }
      | "{" ~> repsep(prop, ",") <~ "}"   ^^ { ps => ObjectExpr(ps:_*) }
  )
  /************
  | functionExpr
  | quasiExpr
  | "(" expr ")"                                         ${(_,e,_2) => e}
  | useVar
  | HOLE                                                 ${h => ['exprHole',h]};
  pattern ::=
  dataLiteral                                          ${n => ['matchData',JSON.parse(n)]}
  | "[" param ** "," "]"                                 ${(_,ps,_2) => ['matchArray',ps]}
  | "{" propParam ** "," "}"                             ${(_,ps,_2) => ['matchObj',ps]}
  | defVar
  | HOLE                                                 ${h => ['patternHole',h]};
   ****/

  def arg: Parser[Expression] = (
    "..." ~> expr                                    ^^ { Spread(_) }
      | expr)

  /****
  param ::=
  "..." pattern                                        ${(_,p) => ['rest',p]}
  | defVar "=" expr                                      ${(v,_,e) => ['optional',v,e]}
  | pattern;
   * **/
  def prop = (
    "..." ~> expr                 ^^ { SpreadObj(_) }
      | (propName <~ ":") ~ expr  ^^ { case k ~ e => Prop(k, e) }
      // TODO | methodDef
      | IDENT                     ^^ { id => Prop(PropKey(id), Use(id)) }
  )
      /**
  propParam ::=
  "..." pattern                                        ${(_,p) => ['restObj',p]}
  | propName ":" pattern                                 ${(k,_,p) => ['matchProp',k,p]}
  | IDENT "=" expr                                       ${(id,_,e) => ['optionalProp',id,id,e]}
  | IDENT                                                ${id => ['matchProp',id,id]};
        * **/
  // No computed property name
  def propName: Parser[PropName] =  (
    (identName | STRING)  ^^ { PropKey(_) }
      | NUMBER            ^^ { n: Double => PropIx(n) }
  )
  /***
  quasiExpr ::=
  QUASI_ALL                                            ${q => ['quasi',[q]]}
  | QUASI_HEAD (expr (QUASI_MID expr)*)? QUASI_TAIL      ${(h,ms,t) => ['quasi',qunpack(h,ms,t)]};
  later ::= NO_NEWLINE "!";
  // No "new", "super", or MetaProperty. Without "new" we don't need
  // separate MemberExpr and CallExpr productions.
  // Recognize b!foo(x) as distinct from calling b!foo post-parse.
  postExpr ::= primaryExpr postOp*                       ${binary};
  postOp ::=
  "." identName                                        ${(_,id) => ['get',id]}
  | "[" indexExpr "]"                                    ${(_,e,_2) => ['index',e]}
  | "(" arg ** "," ")"                                   ${(_,args,_2) => ['call',args]}
  | quasiExpr                                            ${q => ['tag',q]}
  | later identName                                      ${(_,id) => ['getLater',id]}
  | later "[" indexExpr "]"                              ${(_,_2,e,_3) => ['indexLater',e]}
  | later "(" arg ** "," ")"                             ${(_,_2,args,_3) => ['callLater',args]};
  // Omit ("delete" fieldExpr) to avoid mutating properties
  preExpr ::=
  preOp preExpr                                        ${(op,e) => [op,e]}
  | postExpr;
  // No prefix or postfix "++" or "--".
  // No "delete". No bitwise "~".
  preOp ::= "void" | "typeof" | "+" | "-" | "!";
  // Restrict index access to number-names, including
  // floating point, NaN, Infinity, and -Infinity.
  indexExpr ::= "+" preExpr                              ${(op,e) => [op,e]};
  // No bitwise operators, "instanceof", "in", "==", or "!=".  Unlike
  // ES8, none of the relational operators (including equality)
  // associate. To help readers, mixing relational operators always
  // requires explicit parens.
  // TODO: exponentiation "**" operator.
  multExpr ::= preExpr (("*" | "|" | "%") preExpr)*      ${binary};
  addExpr ::= multExpr (("+" | "-") multExpr)*           ${binary};
  relExpr ::= addExpr (relOp addExpr)?                   ${binary};
  relOp ::= "<" | ">" | "<=" | ">=" | "===" | "!==";
  andThenExpr ::= relExpr ("&&" relExpr)*                ${binary};
  orElseExpr ::= andThenExpr ("||" andThenExpr)*         ${binary};
  // No trinary ("?:") expression
  // No comma expression, so assignment expression is expr.
  // TODO: Need to be able to write (1,array[i])(args), which
  // either requires that we readmit the comma expression, or
  // that we add a weird special case to the grammar.
  expr ::=
  lValue assignOp expr                                 ${(lv,op,rv) => [op,lv,rv]}
  | arrow
  | orElseExpr;

   * **/

  def expr = primaryExpr

  /****
  // lValue is only useVar or elementExpr in TinySES.
  // Include only elementExpr from fieldExpr to avoid mutating
  // non-number-named properties.
  // Syntactically disallow ("delete" IDENT).
  // No pseudo-pattern lValues.
  // TODO: re-allow assignment to statically named fields,
  // since it is useful during initialization and prevented
  // thereafter by mandatory tamper-proofing.
  lValue ::= elementExpr | useVar;
  elementExpr ::=
  primaryExpr "[" indexExpr "]"                        ${(pe,_,e,_2) => ['index',pe,e]}
  | primaryExpr later "[" indexExpr "]"                  ${(pe,_,_2,e,_3) => ['indexLater',pe,e]};
  fieldExpr ::=
  primaryExpr "." identName                            ${(pe,_,id) => ['get',pe,id]}
  | primaryExpr later "." identName                      ${(pe,_,_2,id) => ['getLater',pe,id]}
  | elementExpr;
  // No bitwise operators
  assignOp ::= "=" | "*=" | "|=" | "%=" | "+=" | "-=";
  // The expr form must come after the block form, to make proper use
  // of PEG prioritized choice.
  arrow ::=
  params NO_NEWLINE "=>" block                         ${(ps,_,_2,b) => ['arrow',ps,b]}
  | params NO_NEWLINE "=>" expr                          ${(ps,_,_2,e) => ['lambda',ps,e]};
  params ::=
  IDENT                                                ${id => [['def',id]]}
  | "(" param ** "," ")"                                 ${(_,ps,_2) => ps};
  // No "var", empty statement, "with", "do/while", or "for/in". None
  // of the insane variations of "for". Only blocks are accepted for
  // flow-of-control statements.
  // The expr production must go last, so PEG's prioritized choice will
  // interpret {} as a block rather than an expression.
  statement ::=
  block
  | "if" "(" expr ")" block "else" block                 ${(_,_2,c,_3,t,_4,e) => ['if',c,t,e]}
  | "if" "(" expr ")" block                              ${(_,_2,c,_3,t) => ['if',c,t]}
  | "for" "(" declaration expr? ";" expr? ")" block      ${(_,_2,d,c,_3,i,_4,b) => ['for',d,c,i,b]}
  | "for" "(" declOp binding "of" expr ")" block         ${(_,_2,d,_3,e,_4,b) => ['forOf',d,e,b]}
  | "while" "(" expr ")" block                           ${(_,_2,c,_3,b) => ['while',c,b]}
  | "switch" "(" expr ")" "{" branch* "}"                ${(_,_2,e,_3,_4,bs,_5) => ['switch',e,bs]}
  | IDENT ":" statement                                  ${(label,_,stat) => ['label',label,stat]}
  | "try" block catcher finalizer                        ${(_,b,c,f) => ['try',b,c,f]}
  | "try" block finalizer                                ${(_,b,f) => ['try',b,f]}
  | "try" block catcher                                  ${(_,b,c) => ['try',b,c]}
  | terminator
  | "debugger" ";"                                       ${(_,_2) => ['debugger']}
  | expr ";"                                             ${(e,_) => e};
  // Each case branch must end in a terminating statement.
  terminator ::=
  "return" NO_NEWLINE expr ";"                         ${(_,_2,e,_3) => ['return',e]}
  | "return" ";"                                         ${(_,_2) => ['return']}
  | "break" NO_NEWLINE IDENT ";"                         ${(_,_2,label,_3) => ['break',label]}
  | "break" ";"                                          ${(_,_2) => ['break']}
  | "continue" NO_NEWLINE IDENT ";"                      ${(_,_2,label,_3) => ['continue',label]}
  | "continue" ";"                                       ${(_,_2) => ['continue']}
  | "throw" expr ";"                                     ${(_,e,_2) => ['throw',e]};
  // No "class" declaration.
  // No generator, async, or async iterator function.
  declaration ::=
  declOp binding ** "," ";"                            ${(op,decls,_) => [op, decls]}
  | functionDecl;
  declOp ::= "const" | "let";
  // Initializer is mandatory
  binding ::= pattern "=" expr                           ${(p,_,e) => ['bind', p, e]};
  catcher ::= "catch" "(" pattern ")" block              ${(_,_2,p,_3,b) => ['catch',p,b]};
  finalizer ::= "finally" block                          ${(_,b) => ['finally',b]};
  branch ::= caseLabel+ "{" body terminator "}"          ${(cs,_,b,t,_2) => ['branch',cs,[...b,t]]};
  caseLabel ::=
  "case" expr ":"                                      ${(_,e) => ['case', e]}
  | "default" ":"                                        ${(_,_2) => ['default']};
  block ::= "{" body "}"                                 ${(_,b,_2) => ['block', b]};
  body ::= (statement | declaration)*;
  functionExpr ::=
  "function" defVar? "(" params ")" block          ${(_,n,_2,p,_3,b) => ['functionExpr',n,p,b]};
  functionDecl ::=
  "function" defVar "(" params ")" block           ${(_,n,_2,p,_3,b) => ['functionDecl',n,p,b]};
  methodDef
  propName "(" params ")" block                    ${(n,_,p,_2,b) => ['methodDef',n,p,b]}
  | identGet propName "(" ")" block                  ${(_,n,_2,_3,b) => ['getter',n,[],b]}
  | identSet propName "(" param ")" block            ${(_,n,_2,p,_3,b) => ['setter',n,[p],b]};

   **********/

}

object TestSimpleParser extends TinySESParser {
    def main(args: Array[String]) = {
        parse(primaryExpr, "[1, true, false, {x} ]") match {
            case Success(matched,_) => println(matched)
            case Failure(msg,_) => println("FAILURE: " + msg)
            case Error(msg,_) => println("ERROR: " + msg)
        }
    }
}
