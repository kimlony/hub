package com.bizbee.hub.news;

import java.util.Map;

public interface NewsService {
    Map<String, Object> getNewsList(NewsSearchCondition cond);
}
