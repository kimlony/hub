package com.bizbee.hub.news;

import lombok.Data;

@Data
public class NewsSearchCondition {
    private String source;
    private String keyword;
    private int page = 1;
    private int size = 20;

    public int getOffset() {
        return (page - 1) * size;
    }
}
