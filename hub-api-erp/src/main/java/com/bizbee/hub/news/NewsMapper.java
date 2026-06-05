package com.bizbee.hub.news;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface NewsMapper {
    List<NewsRow> findList(@Param("cond") NewsSearchCondition cond);
    int countList(@Param("cond") NewsSearchCondition cond);
}
