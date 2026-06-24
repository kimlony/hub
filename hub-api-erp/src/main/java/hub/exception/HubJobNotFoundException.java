package hub.exception;

public class HubJobNotFoundException extends RuntimeException {

    public HubJobNotFoundException(String requestId) {
        super("Hub job not found for requestId: " + requestId);
    }
}
