import { JoinRoomForm } from '../rooms/RoomForms'
import { RoomGate } from './RoomPage'
import './EnterRoomPage.css'

/** `/room`: one field for a Room Code, for anyone who was given one. */
export function EnterRoomPage() {
  return (
    <RoomGate>
      <div className="enter-room">
        <JoinRoomForm heading="h1" />
      </div>
    </RoomGate>
  )
}
