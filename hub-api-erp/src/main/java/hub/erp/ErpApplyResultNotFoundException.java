package hub.erp;

public class ErpApplyResultNotFoundException extends RuntimeException {
    public ErpApplyResultNotFoundException(long id) {
        super("ERP apply result not found for id: " + id);
    }
}
