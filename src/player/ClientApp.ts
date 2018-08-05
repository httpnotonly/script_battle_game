import {WebsocketConnection} from '../common/WebsocketConnection';
import {Inject} from '../common/InjectDectorator';
import {BattleGame, BattleState} from '../common/battle/BattleGame';
import {EditorComponent} from '../common/editor/EditorComponent';

export class ClientApp {

    @Inject(BattleGame) private battleGame: BattleGame;
    @Inject(WebsocketConnection) private connection: WebsocketConnection;

    private editorComponent: EditorComponent;

    constructor() {
        this.connection.registerAsLeftPlayer();

        this.battleGame.setState(BattleState.battle);

        this.editorComponent = new EditorComponent();

        this.editorComponent.runCode$.subscribe(code => {
            this.battleGame.runCode(code);
        });

        this.connection.onMessage$.subscribe(message => {
            if (message.type === 'state') {
                this.battleGame.setState(message.data);
            }
        });

        this.connection.onClose$.subscribe(() => {
            this.battleGame.setState(BattleState.connectionClosed);
        });

    }

}