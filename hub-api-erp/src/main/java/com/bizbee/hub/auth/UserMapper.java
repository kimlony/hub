package com.bizbee.hub.auth;

import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper {
    Optional<HubUser> findByUsername(String username);
    List<String>      findMallKeysByUserId(Long userId);
}
