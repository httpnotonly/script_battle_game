import {Grid} from "../helpers/Grid";
import {BattleUnit, IAnimationName} from "./BattleUnit";
import {Inject} from "../InjectDectorator";
import {BattleFieldDrawer} from "./BattleFieldDrawer";
import {HexagonalGraph} from "../helpers/HexagonalGraph";
import {IAction} from "../codeSandbox/CodeSandbox";
import {Astar, IPathItem} from "../helpers/Astar";
import {AsyncSequence} from "../helpers/AsyncSequence";
import {Subject} from "rxjs/internal/Subject";
import {ClientState} from "../client/ClientState";
import {CharacterType} from "../characters/CharactersList";
import {BulletType} from "./BulletDrawer";

const FIELD_WIDTH = 12;
const FIELD_HEIGHT = 9;

export class BattleFieldModel {

    bullet$ = new Subject<[BattleUnit, BattleUnit, BulletType]>();

    @Inject(Astar) private astar: Astar;
    @Inject(ClientState) private clientState: ClientState;
    @Inject(BattleFieldDrawer) private battleFieldDrawer: BattleFieldDrawer;

    private grid = new Grid<BattleUnit>(FIELD_WIDTH);
    private graph = new HexagonalGraph(FIELD_WIDTH, FIELD_HEIGHT);

    get units(): BattleUnit[] {
        const result = [];

        this.grid.forEach(unit => {
            if (!!unit) {
                result.push(unit);
            }
        });

        return result;
    }

    constructor() {
        this.grid.getRawData().fill(null);
    }

    set(x: number, y: number, unit: BattleUnit) {
        const oldX = unit.x;
        const oldY = unit.y;

        if (oldX !== unit.x || oldY !== unit.y) {
            this.grid.set(oldX, oldY, null);
            this.graph.setWeight(oldX, oldY, 0);
        }

        this.grid.set(x, y, unit);
        this.graph.setWeight(x, y, 1);
    }

    get(x: number, y: number): BattleUnit {
        return this.grid.get(x, y);
    }

    forEach(callback: (unit: BattleUnit, x: number, y: number) => void) {
        this.grid.forEach(callback);
    }

    doAction(unit: BattleUnit, action: IAction): Promise<any> {
        console.log('doAction', action);

        if (action.action === 'goTo') {
            const toX = parseInt(action.x, 10);
            const toY = parseInt(action.y, 10);

            if (isNaN(toX)) {
                this.dispatchError('x не может быть приведен к числу');
            }

            if (isNaN(toY)) {
                this.dispatchError('y не может быть приведен к числу');
            }

            const path = this.getPath(unit.x, unit.y, toX, toY);

            path.length = Math.min(path.length, unit.character.speed);

            return this.animateUnitByPath(unit, path);
        }

        if (action.action === 'goToEnemyAndHit') {
            const enemy = this.getEnemy(action.id, unit);
            const path = this.getPath(unit.x, unit.y, enemy.x, enemy.y).slice(0, -1);
            const canHitEnemy = path.length <= unit.character.speed;

            path.length = Math.min(path.length, unit.character.speed);

            return this.animateUnitByPath(unit, path)
                .then(() => {
                    if (unit.character.type === CharacterType.magic) {
                        return this.makeBulletAction(unit, enemy)
                            .then(() => {
                                enemy.hitHealth(10, unit);
                            });
                    }

                    if (unit.character.type === CharacterType.shooting) {
                        return this.makeBulletAction(unit, enemy)
                            .then(() => {
                                enemy.hitHealth(10, unit);
                            });
                    }

                    if (canHitEnemy) {
                        return this.makeHitAction(unit, enemy);
                    }

                    return;
                })
        }

        if (action.action === 'say') {
            if (!action.text) {
                this.dispatchError(`Не задан обязательный параметр text`);
            }

            return unit.sayAction(action.text.toString());
        }

        if (action.action === 'shoot') {
            const enemy = this.getEnemy(action.id, unit);

            if (unit.character.type !== CharacterType.shooting) {
                return unit.sayAction('Эй, я не умею стрелять');
            }

            return this.makeBulletAction(unit, enemy)
                .then(() => {
                    enemy.hitHealth(10, unit);
                });
        }

        if (action.action === 'spell') {
            const enemy = this.getEnemy(action.id, unit);

            if (unit.character.type !== CharacterType.magic) {
                return unit.sayAction('Я не знаю магии!');
            }

            return this.makeBulletAction(unit, enemy)
                .then(() => {
                    enemy.hitHealth(10, unit);
                });
        }

        if (action.action === 'heal') {
            const enemy = this.getFriend(action.id, unit);

            if (unit.character.type !== CharacterType.magic) {
                return unit.sayAction('Я не умею лечить!');
            }

            return this.makeBulletAction(unit, enemy);
        }


        if (action.action === 'attackRandom') {
            const enemy = this.getRandomEnemy(unit);

            if (unit.character.type === CharacterType.magic) {
                return this.makeBulletAction(unit, enemy)
                    .then(() => {
                        enemy.hitHealth(10, unit);
                    });
            }

            if (unit.character.type === CharacterType.shooting) {
                return this.makeBulletAction(unit, enemy)
                    .then(() => {
                        enemy.hitHealth(10, unit);
                    });
            }

            const path = this.getPath(unit.x, unit.y, enemy.x, enemy.y).slice(0, -1);
            const canHitEnemy = path.length <= unit.character.speed;

            path.length = Math.min(path.length, unit.character.speed);

            return this.animateUnitByPath(unit, path)
                .then(() => {
                    if (canHitEnemy) {
                        return this.makeHitAction(unit, enemy);
                    }

                    return;
                })
        }

        console.log(`unhandled action: ${action.action}`);
    }

    private getPath(x1: number, y1: number, x2: number, y2: number): IPathItem[] {
        x2 = Math.min(Math.max(x2, 0), FIELD_WIDTH - 1);
        y2 = Math.min(Math.max(y2, 0), FIELD_HEIGHT - 1);

        const fromNode = this.graph.grid.get(x1, y1);
        const toNode = this.graph.grid.get(x2, y2);

        return this.astar.search(this.graph, fromNode, toNode);
    }

    private getEnemy(id: string, toUnit: BattleUnit): BattleUnit {
        if (!id) {
            this.dispatchError(`Не задан обязательный параметр id`);
        }

        const unit = this.units.find(unit => {
            return unit.side !== toUnit.side && unit.id.toLowerCase() === id.toString().toLowerCase();
        });

        if (!unit) {
            this.dispatchError(`Противник с ID "${id}" не найден`);
        }

        return unit;
    }

    private getRandomEnemy(toUnit: BattleUnit): BattleUnit {
        const enemies = this.units.filter(unit => {
           return unit.side !== toUnit.side && unit.health > 0;
        });

        return enemies[Math.floor(Math.random() * enemies.length)];
    }

    private getFriend(id: string, toUnit: BattleUnit): BattleUnit {
        if (!id) {
            this.dispatchError(`Не задан обязательный параметр id`);
        }

        const unit = this.units.find(unit => {
           return unit.side === toUnit.side && unit.id === id;
        });

        if (!unit) {
            this.dispatchError(`Союзник с ID "${id}" не найден`);
        }

        return unit;
    }

    private animateUnitByPath(unit: BattleUnit, path: IPathItem[]): Promise<void> {
        if (path.length === 0) {
            return Promise.resolve();
        }

        const lastItem = path[path.length - 1];

        return AsyncSequence.from(path.map(({x, y}) =>
            () => unit.setPositionAction(x, y)
        )).then(() => {
            this.set(lastItem.x, lastItem.y, unit);
        });
    }

    private makeBulletAction(fromUnit: BattleUnit, toUnit: BattleUnit): Promise<void> {
        const type = fromUnit.character.bulletType;
        const animation = fromUnit.character.attackAnimation;

        fromUnit.setAnimation(animation);

        return new Promise(resolve => {
            setTimeout(() => {
                fromUnit.setAnimation('idle');
                this.bullet$.next([fromUnit, toUnit, type]);

                setTimeout(() => {
                    resolve();
                }, 300);

            }, 700);
        })
    }

    private makeHitAction(fromUnit: BattleUnit, toUnit: BattleUnit): Promise<void> {
        const animation = fromUnit.character.attackAnimation;

        fromUnit.setAnimation(animation);

        return new Promise(resolve => {
            setTimeout(() => {
                toUnit.hitHealth(10, fromUnit);
                fromUnit.setAnimation('idle');
                resolve();
            }, 500);
        })
    }

    private dispatchError(errorText: string) {
        throw new Error(errorText);
    }
}