import {BattleView} from './views/BattleView';
import {WaitingView} from './views/WaitingView';
import Phaser from "phaser";
import {ConnectionClosedView} from "./views/ConnectionClosedView";
import {ISessionResult} from "./BattleSession";
import {ResultsView} from "./views/ResultsView";
import {WinView} from "./views/WinView";
import {LostView} from "./views/LostView";
import {AttentionView} from './views/AttentionView';
import {BattleState} from './BattleState.model';

export class BattleGame {

    stateParams: any = {};
    currentState: BattleState;

    private game: Phaser.Game;

    init() {
        const config = {
            type: Phaser.AUTO,
            width: 400,
            height: 275,
            parent: 'display',
            scene: [WaitingView, BattleView, AttentionView, ResultsView, WinView, LostView, ConnectionClosedView]
        };

        this.game = new Phaser.Game(config);
    }

    setState(newState: BattleState, stateParams: any = {}) {
        if (this.currentState === newState) {
            return;
        }

        this.game.scene.switch(BattleState.wait, newState);

        this.currentState = newState;
        this.stateParams = stateParams || {};
    }

    runCode(leftCode: string, rightCode: string) {
        this.setState(BattleState.battle);

        const battleView = <BattleView>this.game.scene.getScene(BattleState.battle);

        battleView.runCode$.next([leftCode, rightCode]);
    }

    showResults(sessionResult: ISessionResult) {
        this.setState(BattleState.results, sessionResult);

        const resultsView = <ResultsView>this.game.scene.getScene(BattleState.results);

        resultsView.setResults(sessionResult);
    }

    showWinnerScreen(sessionResult: ISessionResult) {
        this.setState(BattleState.win, sessionResult);
    }

    showLoseScreen(sessionResult: ISessionResult) {
        this.setState(BattleState.lost, sessionResult);
    }
}