import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

class SocketService {
  private io: Server | null = null;

  init(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: '*', // In production, restrict this to your frontend URL
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      console.log(' New client connected:', socket.id);

      // Join room based on school ID or bus ID
      socket.on('join-room', (roomId: string) => {
        socket.join(roomId);
        console.log(` Client ${socket.id} joined room: ${roomId}`);
      });

      // Handle location updates from drivers
      socket.on('update-location', (data: { busId: string, schoolId: string, lat: number, lng: number, speed?: number }) => {
        console.log(` Location update for bus ${data.busId}:`, data.lat, data.lng);
        
        // Broadcast to everyone in the school's room
        this.io?.to(data.schoolId).emit('bus-location-updated', data);
        
        // Also broadcast to the specific bus room (for parents tracking one bus)
        this.io?.to(`bus-${data.busId}`).emit('location-updated', data);
      });

      socket.on('disconnect', () => {
        console.log(' Client disconnected:', socket.id);
      });
    });

    return this.io;
  }

  getIO() {
    if (!this.io) {
      throw new Error('Socket.io not initialized!');
    }
    return this.io;
  }

  emit(event: string, data: any) {
    this.io?.emit(event, data);
  }

  to(room: string, event: string, data: any) {
    this.io?.to(room).emit(event, data);
  }
}

export const socketService = new SocketService();
